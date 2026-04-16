import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ArtifactPreviewPayload,
  CrawlArtifact,
  CrawlSourceRecord,
  CrawlTaskDetail,
  CrawlTaskSummary,
  CrawlWorkItem,
  CreateTaskRequest,
  SourceId,
  TaskTargetConfig,
} from '@legaladvisor/shared';
import {
  AlertTriangle,
  CirclePause,
  CirclePlay,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ScrapingDashboard.module.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ArtifactPanel } from '../components/dashboard/ArtifactPanel';
import { ArtifactPreview } from '../components/dashboard/ArtifactPreview';
import { TaskComposer } from '../components/dashboard/TaskComposer';
import { api } from '../lib/api';

type FieldValue = string | number | boolean;

type TimelineStep = {
  id: string;
  title: string;
  context: string | null;
  workItemId: string | null;
  startedAtLabel: string;
  startedAtMs: number;
  durationLabel: string;
  stateLabel: string;
  stateTone: 'done' | 'running' | 'failed' | 'cancelled';
};

const AUTO_TASK_SYNC_MS = 15_000;
const AUTO_SOURCE_SYNC_MS = 60_000;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  queued: '等待中',
  dispatching: '派送中',
  running: '執行中',
  paused: '已暫停',
  throttled: '限流中',
  completed: '已完成',
  partial_success: '部分完成',
  failed: '失敗',
  cancelled: '已取消',
  pending: '等待中',
  fetching_index: '抓取索引',
  fetching_detail: '抓取內容',
  parsing: '解析中',
  normalizing: '整理中',
  writing_output: '輸出中',
  done: '完成',
  skipped: '略過',
};

function formatDateTime(value: string | null) {
  if (!value) {
    return '尚未更新';
  }
  return new Date(value).toLocaleString('zh-TW', { hour12: false });
}

function formatEta(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return '系統計算中';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分`;
  }
  if (minutes > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`;
  }
  return `${remainingSeconds} 秒`;
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return '少於 1 秒';
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分 ${seconds} 秒`;
  }
  if (minutes > 0) {
    return `${minutes} 分 ${seconds} 秒`;
  }
  return `${seconds} 秒`;
}

function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function describeWorkItemStep(workItem: CrawlWorkItem) {
  const processed = workItem.itemsProcessed ?? 0;
  const total = workItem.itemsTotal ?? 0;

  if (workItem.currentStage === 'pending') {
    return '等待工作器接手';
  }
  if (workItem.currentStage === 'fetching_index') {
    return '下載法規資料總檔中';
  }
  if (workItem.currentStage === 'fetching_detail') {
    return '抓取明細資料中';
  }
  if (workItem.currentStage === 'parsing') {
    return '解析法規資料中';
  }
  if (workItem.currentStage === 'normalizing') {
    return total > 0 ? `整理資料中（${processed}/${total}）` : '整理資料中';
  }
  if (workItem.currentStage === 'writing_output') {
    return total > 0 ? `輸出法規快照中（${processed}/${total}）` : '輸出法規快照中';
  }
  if (workItem.currentStage === 'done') {
    return workItem.lastMessage || '輸出完成';
  }
  if (workItem.currentStage === 'failed') {
    return workItem.lastMessage || '執行失敗';
  }
  return formatStatusLabel(workItem.currentStage);
}

function describeTaskDuration(task: CrawlTaskSummary, nowTimestamp: number) {
  const startedAt = parseTimestamp(task.startedAt);
  if (!startedAt) {
    return '尚未開始';
  }

  const finishedAt = parseTimestamp(task.finishedAt);
  const endAt = finishedAt ?? nowTimestamp;
  const prefix = finishedAt ? '總耗時' : '目前已執行';
  return `${prefix} ${formatDuration(endAt - startedAt)}`;
}

function buildExecutionTimeline(detail: CrawlTaskDetail, task: CrawlTaskSummary, nowTimestamp: number): TimelineStep[] {
  const workItemLookup = new Map(detail.workItems.map((workItem) => [workItem.id, workItem]));
  const timelineEventTypes = new Set(['task-created', 'task-status', 'work-item-status']);
  const orderedEvents = [...detail.recentEvents]
    .filter((eventItem) => timelineEventTypes.has(eventItem.eventType))
    .reverse();

  const eventSteps = orderedEvents.map((eventItem, index) => {
      const startedAt = parseTimestamp(eventItem.occurredAt) ?? nowTimestamp;
      const nextStartedAt = parseTimestamp(orderedEvents[index + 1]?.occurredAt);
      const finishedAt = parseTimestamp(task.finishedAt);
      const endedAt = nextStartedAt ?? finishedAt ?? nowTimestamp;
      const relatedWorkItem = eventItem.workItemId ? workItemLookup.get(eventItem.workItemId)?.label ?? null : null;
      const isLatest = index === orderedEvents.length - 1;

      let stateTone: TimelineStep['stateTone'] = 'done';
      let stateLabel = '完成';
      if (isLatest && !finishedAt) {
        stateTone = 'running';
        stateLabel = '進行中';
      } else if (isLatest && task.status === 'failed') {
        stateTone = 'failed';
        stateLabel = '失敗';
      } else if (isLatest && task.status === 'cancelled') {
        stateTone = 'cancelled';
        stateLabel = '已取消';
      } else if (eventItem.level === 'error') {
        stateTone = 'failed';
        stateLabel = '失敗';
      }

      return {
        id: eventItem.id,
        title: eventItem.message,
        context: relatedWorkItem ? `項目：${relatedWorkItem}` : '主任務',
        workItemId: eventItem.workItemId ?? null,
        startedAtLabel: formatDateTime(eventItem.occurredAt),
        startedAtMs: startedAt,
        durationLabel: `${stateTone === 'running' ? '已執行' : '耗時'} ${formatDuration(endedAt - startedAt)}`,
        stateLabel,
        stateTone,
      };
    });

  const liveStateSteps = [...detail.workItems]
    .sort((left, right) => {
      const leftTime = parseTimestamp(left.startedAt) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = parseTimestamp(right.startedAt) ?? Number.MAX_SAFE_INTEGER;
      return leftTime === rightTime ? left.sequenceNo - right.sequenceNo : leftTime - rightTime;
    })
    .filter((workItem) => {
      const currentTitle = describeWorkItemStep(workItem);
      const latestWorkItemEvent = [...eventSteps].reverse().find((step) => step.workItemId === workItem.id) ?? null;

      if (!latestWorkItemEvent) {
        return true;
      }

      if (['done', 'failed', 'skipped'].includes(workItem.status)) {
        return false;
      }

      return latestWorkItemEvent.title !== currentTitle || latestWorkItemEvent.stateLabel !== '進行中';
    })
    .map((workItem) => {
      const startedAt = parseTimestamp(workItem.startedAt) ?? parseTimestamp(task.startedAt) ?? nowTimestamp;
      const finishedAt = parseTimestamp(workItem.finishedAt) ?? parseTimestamp(task.finishedAt) ?? nowTimestamp;
      const isFinished = Boolean(workItem.finishedAt);
      const stateTone: TimelineStep['stateTone'] = workItem.status === 'failed' ? 'failed' : isFinished ? 'done' : 'running';
      return {
        id: `live-${workItem.id}`,
        title: describeWorkItemStep(workItem),
        context: `項目：${workItem.label}`,
        workItemId: workItem.id,
        startedAtLabel: formatDateTime(workItem.startedAt ?? task.startedAt),
        startedAtMs: startedAt,
        durationLabel: `${isFinished ? '耗時' : '已執行'} ${formatDuration(finishedAt - startedAt)}`,
        stateLabel: workItem.status === 'failed' ? '失敗' : isFinished ? '完成' : '進行中',
        stateTone,
      };
    });

  if (eventSteps.length === 0) {
    return liveStateSteps;
  }

  return [...eventSteps, ...liveStateSteps].sort((left, right) => {
    if (left.startedAtMs === right.startedAtMs) {
      return left.id.localeCompare(right.id);
    }
    return left.startedAtMs - right.startedAtMs;
  });
}

function mapProgressStatus(status: CrawlTaskSummary['status'] | CrawlWorkItem['status']) {
  if (['completed', 'done'].includes(status)) {
    return 'success' as const;
  }
  if (['failed', 'cancelled'].includes(status)) {
    return 'error' as const;
  }
  if (['queued', 'draft', 'pending', 'paused'].includes(status)) {
    return 'idle' as const;
  }
  return 'running' as const;
}

function buildInitialFormValues(source: CrawlSourceRecord | null) {
  if (!source) {
    return {} as Record<string, FieldValue>;
  }

  return Object.fromEntries(
    source.taskBuilderFields.map((field) => [field.name, field.type === 'checkbox' ? false : '']),
  );
}

function buildTaskTarget(sourceId: SourceId, values: Record<string, FieldValue>): TaskTargetConfig {
  if (sourceId === 'moj-laws') {
    return {
      kind: 'law',
      label: String(values.label || values.query || '未命名法規任務'),
      query: String(values.query || ''),
      exactMatch: Boolean(values.exactMatch),
    };
  }

  if (sourceId === 'judicial-sites') {
    return {
      kind: 'judicial-list',
      label: String(values.label || '司法院補充資料'),
      startUrl: String(values.startUrl || ''),
      maxPages: Number(values.maxPages || 1),
    };
  }

  return {
    kind: 'judgment-dataset',
    label: String(values.label || '裁判資料集'),
    fileSetId: Number(values.fileSetId || 0),
    top: values.top ? Number(values.top) : undefined,
    skip: values.skip ? Number(values.skip) : undefined,
  };
}

export function ScrapingDashboard() {
  const [sources, setSources] = useState<CrawlSourceRecord[]>([]);
  const [tasks, setTasks] = useState<CrawlTaskSummary[]>([]);
  const [taskDetails, setTaskDetails] = useState<Record<string, CrawlTaskDetail>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [activePreviewArtifactId, setActivePreviewArtifactId] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreviewPayload | null>(null);
  const [isArtifactPreviewOpen, setIsArtifactPreviewOpen] = useState(false);
  const [isArtifactPreviewLoading, setIsArtifactPreviewLoading] = useState(false);
  const [artifactPreviewError, setArtifactPreviewError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  );

  const activeTaskDetail = useMemo(
    () => (activeTask ? taskDetails[activeTask.id] ?? null : null),
    [activeTask, taskDetails],
  );

  const activeErrorMessage = useMemo(() => {
    if (!activeTask) {
      return null;
    }
    const failedItem = activeTaskDetail?.workItems.find((workItem) => workItem.status === 'failed' && workItem.lastMessage);
    if (failedItem?.lastMessage) {
      return failedItem.lastMessage;
    }
    if (['failed', 'partial_success'].includes(activeTask.status) && activeTask.summary) {
      return activeTask.summary;
    }
    return null;
  }, [activeTask, activeTaskDetail]);

  const executionTimeline = useMemo(() => {
    if (!activeTask || !activeTaskDetail) {
      return [];
    }
    return buildExecutionTimeline(activeTaskDetail, activeTask, nowTimestamp);
  }, [activeTask, activeTaskDetail, nowTimestamp]);

  const syncSources = useCallback(async (includeHealthRefresh = false) => {
    const nextSources = includeHealthRefresh
      ? await api.refreshSources().catch(() => api.listSources())
      : await api.listSources();

    setSources(nextSources);
    setSelectedSourceId((current) => {
      if (current && nextSources.some((source) => source.id === current)) {
        return current;
      }
      return nextSources[0]?.id ?? null;
    });
  }, []);

  const refreshTasks = useCallback(async () => {
    const nextTasks = await api.listTasks();
    setTasks(nextTasks);
    setActiveTaskId((current) => {
      if (current && nextTasks.some((task) => task.id === current)) {
        return current;
      }
      return nextTasks[0]?.id ?? null;
    });
  }, []);

  const loadTaskDetail = useCallback(async (taskId: string, force = false) => {
    if (!force && taskDetails[taskId]) {
      return;
    }
    const detail = await api.getTask(taskId);
    if (detail) {
      setTaskDetails((current) => ({ ...current, [taskId]: detail }));
    }
  }, [taskDetails]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all([syncSources(true), refreshTasks()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '無法載入頁面資料');
    } finally {
      setIsLoading(false);
    }
  }, [refreshTasks, syncSources]);

  useEffect(() => {
    setFormValues(buildInitialFormValues(selectedSource));
  }, [selectedSource]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setNowTimestamp(Date.now());
  }, [activeTaskId]);

  useEffect(() => {
    setIsArtifactPreviewOpen(false);
    setArtifactPreview(null);
    setActivePreviewArtifactId(null);
    setArtifactPreviewError(null);
    setIsArtifactPreviewLoading(false);
  }, [activeTaskId]);

  useEffect(() => {
    if (activeTaskId) {
      void loadTaskDetail(activeTaskId);
    }
  }, [activeTaskId, loadTaskDetail]);

  useEffect(() => {
    const eventSource = api.createTaskStream();
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { kind: string; taskId?: string };
      if (payload.kind === 'heartbeat') {
        return;
      }

      startTransition(() => {
        void refreshTasks();
        if (payload.taskId && payload.taskId === activeTaskId) {
          void loadTaskDetail(payload.taskId, true);
        }
        if (payload.kind === 'source-updated') {
          void syncSources(false);
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [activeTaskId, loadTaskDetail, refreshTasks, syncSources]);

  useEffect(() => {
    if (!activeTask || activeTask.finishedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTask]);

  useEffect(() => {
    const taskTimer = window.setInterval(() => {
      void refreshTasks();
      if (activeTaskId) {
        void loadTaskDetail(activeTaskId, true);
      }
    }, AUTO_TASK_SYNC_MS);

    const sourceTimer = window.setInterval(() => {
      void syncSources(true).catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '來源同步失敗');
      });
    }, AUTO_SOURCE_SYNC_MS);

    return () => {
      window.clearInterval(taskTimer);
      window.clearInterval(sourceTimer);
    };
  }, [activeTaskId, loadTaskDetail, refreshTasks, syncSources]);

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSourceId) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const request: CreateTaskRequest = {
        sourceId: selectedSourceId,
        targets: [buildTaskTarget(selectedSourceId, formValues)],
      };
      const createdTask = await api.createTask(request);
      setTasks((current) => [createdTask, ...current.filter((task) => task.id !== createdTask.id)]);
      setTaskDetails((current) => ({ ...current, [createdTask.id]: createdTask }));
      setActiveTaskId(createdTask.id);
      setFormValues(buildInitialFormValues(selectedSource));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '建立任務失敗');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTaskAction(taskId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') {
    setErrorMessage(null);
    try {
      if (action === 'pause') {
        await api.pauseTask(taskId);
      } else if (action === 'resume') {
        await api.resumeTask(taskId);
      } else if (action === 'cancel') {
        await api.cancelTask(taskId);
      } else {
        await api.retryFailed(taskId);
      }
      await Promise.all([refreshTasks(), loadTaskDetail(taskId, true)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任務操作失敗');
    }
  }

  function updateFormValue(name: string, value: FieldValue) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  async function openArtifactPreview(artifact: CrawlArtifact) {
    setActivePreviewArtifactId(artifact.id);
    setArtifactPreview(null);
    setArtifactPreviewError(null);
    setIsArtifactPreviewOpen(true);
    setIsArtifactPreviewLoading(true);

    try {
      const preview = await api.getArtifactPreview(artifact.id);
      setArtifactPreview(preview);
    } catch (error) {
      setArtifactPreviewError(error instanceof Error ? error.message : '無法載入檔案預覽');
    } finally {
      setIsArtifactPreviewLoading(false);
    }
  }

  function closeArtifactPreview() {
    setIsArtifactPreviewOpen(false);
  }

  function downloadArtifact(artifactId: string) {
    window.open(api.artifactDownloadUrl(artifactId), '_blank', 'noopener,noreferrer');
  }

  function selectTask(taskId: string) {
    setActiveTaskId(taskId);
    void loadTaskDetail(taskId);
  }

  return (
    <div className={clsx(styles.dashboard, 'animate-fade-in')}>
      {errorMessage && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className={styles.topGrid}>
        <Card className={styles.createTaskCard}>
          <CardContent>
            <TaskComposer
              sources={sources}
              selectedSourceId={selectedSourceId}
              formValues={formValues}
              isSubmitting={isSubmitting}
              onSelectSource={setSelectedSourceId}
              onSubmit={handleCreateTask}
              onFieldChange={updateFormValue}
            />
          </CardContent>
        </Card>
      </div>

      <Card className={styles.tasksCard}>
        <CardHeader className={styles.sectionHeader}>
          <CardTitle>任務進度</CardTitle>
        </CardHeader>
        <CardContent className={styles.taskWorkspace}>
          <div className={styles.taskRail}>
            {isLoading && <div className={styles.emptyState}>載入中...</div>}
            {!isLoading && tasks.length === 0 && <div className={styles.emptyState}>尚未建立任何爬取任務。</div>}
            {tasks.map((task) => {
              const isActive = task.id === activeTaskId;

              return (
                <button
                  key={task.id}
                  type="button"
                  className={clsx(styles.taskRailItem, isActive && styles.taskRailItemActive)}
                  onClick={() => selectTask(task.id)}
                >
                  <div className={styles.taskRailTop}>
                    <strong className={styles.taskRailTitle}>{task.targets.map((target) => target.label).join('、')}</strong>
                    <div className={styles.taskRailStatusGroup}>
                      <span className={clsx(styles.taskStatusBadge, styles[`task-${task.status}`])}>
                        {formatStatusLabel(task.status)}
                      </span>
                      <span className={styles.taskRailDuration}>{describeTaskDuration(task, nowTimestamp)}</span>
                    </div>
                  </div>

                  <div className={styles.taskRailMetaRow}>
                    <span className={styles.taskUpdatedAt}>{formatDateTime(task.updatedAt)}</span>
                    <span className={styles.taskRailSource}>{task.sourceName}</span>
                  </div>
                  <ProgressBar
                    progress={task.overallProgress}
                    status={mapProgressStatus(task.status)}
                    label={`${task.completedWorkItems}/${task.totalWorkItems} 已完成`}
                  />
                </button>
              );
            })}
          </div>

          <div className={styles.taskPreview}>
            {!activeTask && !isLoading && <div className={styles.emptyPreview}>建立任務後，這裡會顯示詳細進度與輸出檔案。</div>}

            {activeTask && (
              <>
                <div className={styles.previewHeader}>
                  <div className={styles.previewHeading}>
                    <div className={styles.previewTitleRow}>
                      <h3 className={styles.previewTitle}>{activeTask.targets.map((target) => target.label).join('、')}</h3>
                      <span className={clsx(styles.taskStatusBadge, styles[`task-${activeTask.status}`])}>
                        {formatStatusLabel(activeTask.status)}
                      </span>
                    </div>
                    <p className={styles.previewSubline}>
                      {activeTask.sourceName} · 開始時間 {formatDateTime(activeTask.startedAt)} · {describeTaskDuration(activeTask, nowTimestamp)}
                      {!activeTask.finishedAt && ` · ETA ${formatEta(activeTask.etaSeconds)}`}
                    </p>
                  </div>

                  <div className={styles.previewActions}>
                    {['queued', 'running', 'dispatching', 'throttled'].includes(activeTask.status) && (
                      <Button variant="secondary" size="sm" icon={<CirclePause size={16} />} onClick={() => void handleTaskAction(activeTask.id, 'pause')}>
                        暫停
                      </Button>
                    )}
                    {activeTask.status === 'paused' && (
                      <Button variant="secondary" size="sm" icon={<CirclePlay size={16} />} onClick={() => void handleTaskAction(activeTask.id, 'resume')}>
                        繼續
                      </Button>
                    )}
                    {activeTask.failedWorkItems > 0 && (
                      <Button variant="secondary" size="sm" icon={<RefreshCcw size={16} />} onClick={() => void handleTaskAction(activeTask.id, 'retry')}>
                        重試失敗項目
                      </Button>
                    )}
                    {!['cancelled', 'completed', 'failed'].includes(activeTask.status) && (
                      <Button variant="danger" size="sm" icon={<XCircle size={16} />} onClick={() => void handleTaskAction(activeTask.id, 'cancel')}>
                        取消
                      </Button>
                    )}
                  </div>
                </div>

                {activeErrorMessage && (
                  <div className={styles.inlineError}>
                    <AlertTriangle size={16} />
                    <span>{activeErrorMessage}</span>
                  </div>
                )}

                {!activeTaskDetail && <div className={styles.emptyPreview}>讀取任務詳情中...</div>}

                {activeTaskDetail && (
                  <div className={styles.previewBody}>
                    <div className={styles.workstream}>
                      <div className={styles.workstreamHeader}>
                        <h4>執行明細</h4>
                        <span>{executionTimeline.length} 個步驟</span>
                      </div>

                      {executionTimeline.length === 0 && <div className={styles.emptyHint}>尚無執行紀錄。</div>}

                      <div className={styles.timelineList}>
                        {executionTimeline.map((step, index) => (
                          <article key={step.id} className={clsx(styles.timelineItem, styles[`timeline-${step.stateTone}`])}>
                            <div className={styles.timelineIndex}>{index + 1}</div>
                            <div className={styles.timelineBody}>
                              <div className={styles.timelineTop}>
                                <div className={styles.timelineTitleRow}>
                                    <strong className={styles.timelineTitleText}>{step.title}</strong>
                                  <span className={clsx(styles.timelineState, styles[`timelineState-${step.stateTone}`])}>
                                    {step.stateLabel}
                                  </span>
                                </div>
                                <span className={styles.timelineDuration}>{step.durationLabel}</span>
                              </div>
                              <div className={styles.timelineMeta}>
                                <span>開始：{step.startedAtLabel}</span>
                                {step.context && <span>{step.context}</span>}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <ArtifactPanel
                      taskId={activeTask.id}
                      artifacts={activeTaskDetail.artifacts}
                      activeArtifactId={activePreviewArtifactId}
                      onOpenPreview={(artifact) => void openArtifactPreview(artifact)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ArtifactPreview
        key={activePreviewArtifactId ?? 'artifact-preview'}
        open={isArtifactPreviewOpen}
        isLoading={isArtifactPreviewLoading}
        errorMessage={artifactPreviewError}
        preview={artifactPreview}
        onClose={closeArtifactPreview}
        onDownload={downloadArtifact}
      />
    </div>
  );
}
