import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type {
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
  ChevronDown,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Database,
  Download,
  FileDown,
  FileText,
  Gauge,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Scale,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ScrapingDashboard.module.css';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { api } from '../lib/api';

type FieldValue = string | number | boolean;

function formatDateTime(value: string | null) {
  if (!value) {
    return '尚未更新';
  }
  return new Date(value).toLocaleString('zh-TW', { hour12: false });
}

function formatEta(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return '計算中';
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

function artifactLabel(artifact: CrawlArtifact) {
  switch (artifact.artifactKind) {
    case 'law_source_snapshot':
      return '法規來源快照';
    case 'law_document_snapshot':
      return '法規 Markdown';
    case 'law_article_snapshot':
      return '條文 JSON';
    case 'law_revision_snapshot':
      return '沿革 JSON';
    case 'law_cross_reference_snapshot':
      return '交叉引用 JSON';
    case 'judicial_site_snapshot':
      return '司法院網站 JSON';
    case 'judicial_site_markdown':
      return '司法院網站 Markdown';
    case 'judgment_source_snapshot':
      return '裁判資料 JSON';
    case 'judgment_document_snapshot':
      return '裁判資料 Markdown';
    case 'batch_manifest':
      return '批次 Manifest';
    default:
      return artifact.artifactKind;
  }
}

export function ScrapingDashboard() {
  const [sources, setSources] = useState<CrawlSourceRecord[]>([]);
  const [tasks, setTasks] = useState<CrawlTaskSummary[]>([]);
  const [taskDetails, setTaskDetails] = useState<Record<string, CrawlTaskDetail>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [expandedWorkItemIds, setExpandedWorkItemIds] = useState<string[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const taskTotals = useMemo(
    () =>
      tasks.reduce(
        (accumulator, task) => {
          accumulator.total += 1;
          if (['running', 'dispatching', 'throttled'].includes(task.status)) {
            accumulator.running += 1;
          }
          if (task.status === 'completed') {
            accumulator.completed += 1;
          }
          if (['failed', 'partial_success'].includes(task.status)) {
            accumulator.attention += 1;
          }
          return accumulator;
        },
        { total: 0, running: 0, completed: 0, attention: 0 },
      ),
    [tasks],
  );

  const refreshSources = useCallback(async () => {
    const nextSources = await api.listSources();
    setSources(nextSources);
    setSelectedSourceId((current) => current ?? nextSources[0]?.id ?? null);
  }, []);

  const refreshTasks = useCallback(async () => {
    const nextTasks = await api.listTasks();
    setTasks(nextTasks);
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
      const [nextSources, nextTasks] = await Promise.all([api.listSources(), api.listTasks()]);
      setSources(nextSources);
      setSelectedSourceId((current) => current ?? nextSources[0]?.id ?? null);
      setTasks(nextTasks);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '無法載入第一頁資料');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setFormValues(buildInitialFormValues(selectedSource));
  }, [selectedSource]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const eventSource = api.createTaskStream();
    setConnectionState('connecting');
    eventSource.onopen = () => setConnectionState('live');
    eventSource.onerror = () => setConnectionState('offline');
    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { kind: string; taskId?: string };
      if (payload.kind === 'heartbeat') {
        setConnectionState('live');
        return;
      }

      startTransition(() => {
        void refreshTasks();
        if (payload.taskId && expandedTaskIds.includes(payload.taskId)) {
          void loadTaskDetail(payload.taskId, true);
        }
        if (payload.kind === 'source-updated') {
          void refreshSources();
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [expandedTaskIds, loadTaskDetail, refreshSources, refreshTasks]);

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
      setExpandedTaskIds((current) => (current.includes(createdTask.id) ? current : [createdTask.id, ...current]));
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

  function toggleTaskExpansion(taskId: string) {
    setExpandedTaskIds((current) => {
      if (current.includes(taskId)) {
        return current.filter((id) => id !== taskId);
      }
      void loadTaskDetail(taskId, true);
      return [...current, taskId];
    });
  }

  function toggleWorkItemExpansion(workItemId: string) {
    setExpandedWorkItemIds((current) =>
      current.includes(workItemId) ? current.filter((id) => id !== workItemId) : [...current, workItemId],
    );
  }

  function updateFormValue(name: string, value: FieldValue) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className={clsx(styles.dashboard, 'animate-fade-in')}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>網頁爬取管理平台</h2>
          <p className={styles.subtitle}>正式拆分後的第一頁控制台，專注於來源爬取、任務佇列、展開式進度檢視與 JSON/MD 輸出。</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={() => void refreshAll()}>
            全域重整
          </Button>
          <Button
            variant="secondary"
            icon={<Gauge size={18} />}
            onClick={() => {
              void api.refreshSources().then(setSources).catch((error: Error) => setErrorMessage(error.message));
            }}
          >
            檢查來源健康
          </Button>
        </div>
      </div>

      <div className={styles.statusBar}>
        <span className={clsx(styles.statusDot, styles[`status-${connectionState}`])} />
        <span>事件串流：{connectionState === 'live' ? '即時連線中' : connectionState === 'connecting' ? '連線中' : '離線'}</span>
        <span className={styles.statusDivider}>•</span>
        <span>任務總數 {taskTotals.total}</span>
        <span className={styles.statusDivider}>•</span>
        <span>執行中 {taskTotals.running}</span>
        <span className={styles.statusDivider}>•</span>
        <span>已完成 {taskTotals.completed}</span>
        <span className={styles.statusDivider}>•</span>
        <span>需關注 {taskTotals.attention}</span>
      </div>

      {errorMessage && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className={styles.topGrid}>
        <Card className={styles.createTaskCard}>
          <CardHeader>
            <CardTitle>
              <ListChecks size={20} /> 建立新爬取任務
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className={styles.taskForm} onSubmit={handleCreateTask}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>來源</span>
                <select className={styles.select} value={selectedSourceId ?? ''} onChange={(event) => setSelectedSourceId(event.target.value as SourceId)}>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedSource?.taskBuilderFields.map((field) => (
                <label key={field.name} className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>{field.label}</span>
                  {field.type === 'checkbox' ? (
                    <span className={styles.checkboxRow}>
                      <input type="checkbox" checked={Boolean(formValues[field.name])} onChange={(event) => updateFormValue(field.name, event.target.checked)} />
                      <span>{field.description ?? '啟用此設定'}</span>
                    </span>
                  ) : (
                    <input
                      className={styles.input}
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={String(formValues[field.name] ?? '')}
                      onChange={(event) => updateFormValue(field.name, event.target.value)}
                    />
                  )}
                  {field.description && field.type !== 'checkbox' && <small className={styles.fieldHint}>{field.description}</small>}
                </label>
              ))}

              <div className={styles.formActions}>
                <Button type="submit" variant="primary" icon={<CirclePlay size={18} />} disabled={isSubmitting || !selectedSourceId}>
                  {isSubmitting ? '建立中...' : '建立並排入佇列'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className={styles.sourcesGrid}>
          {sources.map((source) => (
            <Card key={source.id} variant="glow">
              <CardHeader>
                <CardTitle>
                  {source.id === 'moj-laws' ? <FileText size={20} /> : source.id === 'judicial-sites' ? <Database size={20} /> : <Scale size={20} />}
                  {source.name}
                </CardTitle>
                <span className={clsx(styles.badge, styles[`health-${source.healthStatus}`])}>{source.healthStatus}</span>
              </CardHeader>
              <CardContent>
                <div className={styles.sourceStats}>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>請求狀態</span>
                    <span className={styles.statValue}>{source.rateLimitStatus}</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>今日請求數</span>
                    <span className={styles.statValue}>{source.todayRequestCount}</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>最後檢查</span>
                    <span className={styles.statValueSmall}>{formatDateTime(source.lastCheckedAt)}</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statLabel}>備註</span>
                    <span className={styles.statValueSmall}>{source.notes}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className={styles.tasksCard}>
        <CardHeader>
          <CardTitle>當前爬取隊列與進度</CardTitle>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={16} />} onClick={() => void refreshTasks()}>
            重整列表
          </Button>
        </CardHeader>
        <div className={styles.taskList}>
          {isLoading && <div className={styles.emptyState}>載入中...</div>}
          {!isLoading && tasks.length === 0 && <div className={styles.emptyState}>尚未建立任何爬取任務。</div>}
          {tasks.map((task) => {
            const isExpanded = expandedTaskIds.includes(task.id);
            const detail = taskDetails[task.id];
            return (
              <div key={task.id} className={styles.taskCard}>
                <button type="button" className={styles.taskSummary} onClick={() => toggleTaskExpansion(task.id)}>
                  <div className={styles.expandIcon}>{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
                  <div className={styles.taskMetaColumn}>
                    <div className={styles.taskHeadline}>
                      <span className={styles.taskName}>{task.targets.map((target) => target.label).join('、')}</span>
                      <span className={clsx(styles.taskStatusBadge, styles[`task-${task.status}`])}>{task.status}</span>
                    </div>
                    <div className={styles.taskSubline}>
                      <span>{task.sourceName}</span>
                      <span>最後更新：{formatDateTime(task.updatedAt)}</span>
                      <span>ETA：{formatEta(task.etaSeconds)}</span>
                    </div>
                  </div>
                  <div className={styles.taskProgressColumn}>
                    <ProgressBar progress={task.overallProgress} status={mapProgressStatus(task.status)} label={`${task.completedWorkItems}/${task.totalWorkItems} 已完成`} />
                  </div>
                  <div className={styles.taskActionColumn} onClick={(event) => event.stopPropagation()}>
                    {['queued', 'running', 'dispatching', 'throttled'].includes(task.status) && (
                      <Button variant="ghost" size="sm" icon={<CirclePause size={16} />} onClick={() => void handleTaskAction(task.id, 'pause')} />
                    )}
                    {['paused', 'failed', 'partial_success'].includes(task.status) && (
                      <Button variant="ghost" size="sm" icon={<CirclePlay size={16} />} onClick={() => void handleTaskAction(task.id, 'resume')} />
                    )}
                    {task.failedWorkItems > 0 && (
                      <Button variant="ghost" size="sm" icon={<RotateCcw size={16} />} onClick={() => void handleTaskAction(task.id, 'retry')} />
                    )}
                    <Button variant="ghost" size="sm" icon={<FileDown size={16} />} onClick={() => window.open(api.manifestDownloadUrl(task.id), '_blank', 'noopener,noreferrer')} />
                    {!['cancelled', 'completed'].includes(task.status) && (
                      <Button variant="ghost" size="sm" icon={<XCircle size={16} />} onClick={() => void handleTaskAction(task.id, 'cancel')} />
                    )}
                  </div>
                </button>

                {isExpanded && detail && (
                  <div className={styles.taskDetailPanel}>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailSection}>
                        <h4>任務摘要</h4>
                        <ul className={styles.keyValueList}>
                          <li><span>狀態</span><strong>{detail.status}</strong></li>
                          <li><span>已完成</span><strong>{detail.completedWorkItems}</strong></li>
                          <li><span>失敗</span><strong>{detail.failedWorkItems}</strong></li>
                          <li><span>警告</span><strong>{detail.warningCount}</strong></li>
                          <li><span>開始時間</span><strong>{formatDateTime(detail.startedAt)}</strong></li>
                        </ul>
                      </div>

                      <div className={styles.detailSection}>
                        <h4>最近事件</h4>
                        <div className={styles.eventList}>
                          {detail.recentEvents.slice(0, 8).map((eventItem) => (
                            <div key={eventItem.id} className={clsx(styles.eventItem, styles[`event-${eventItem.level}`])}>
                              <div>{eventItem.message}</div>
                              <small>{formatDateTime(eventItem.occurredAt)}</small>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={styles.detailSection}>
                        <h4>輸出檔案</h4>
                        <div className={styles.artifactList}>
                          {detail.artifacts.slice(0, 10).map((artifact) => (
                            <button key={artifact.id} type="button" className={styles.artifactItem} onClick={() => window.open(api.artifactDownloadUrl(artifact.id), '_blank', 'noopener,noreferrer')}>
                              <div>
                                <strong>{artifactLabel(artifact)}</strong>
                                <small>{artifact.fileName}</small>
                              </div>
                              <Download size={16} />
                            </button>
                          ))}
                          {detail.artifacts.length === 0 && <div className={styles.emptyHint}>尚未輸出 artifact。</div>}
                        </div>
                      </div>
                    </div>

                    <div className={styles.workItemSection}>
                      <h4>Work Items</h4>
                      <div className={styles.workItemList}>
                        {detail.workItems.map((workItem) => {
                          const isWorkItemExpanded = expandedWorkItemIds.includes(workItem.id);
                          return (
                            <div key={workItem.id} className={styles.workItemCard}>
                              <button type="button" className={styles.workItemSummary} onClick={() => toggleWorkItemExpansion(workItem.id)}>
                                <div className={styles.expandIcon}>{isWorkItemExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
                                <div className={styles.workItemMeta}>
                                  <div className={styles.workItemTitleRow}>
                                    <strong>{workItem.label}</strong>
                                    <span className={clsx(styles.taskStatusBadge, styles[`task-${workItem.status}`])}>{workItem.status}</span>
                                  </div>
                                  <div className={styles.workItemSubtitle}>
                                    <span>階段：{workItem.currentStage}</span>
                                    <span>訊息：{workItem.lastMessage || '—'}</span>
                                  </div>
                                </div>
                                <div className={styles.workItemProgressWrap}>
                                  <ProgressBar progress={workItem.progress} status={mapProgressStatus(workItem.status)} label={`${workItem.itemsProcessed}/${workItem.itemsTotal || '?'} 筆`} />
                                </div>
                              </button>

                              {isWorkItemExpanded && (
                                <div className={styles.workItemDetail}>
                                  <ul className={styles.keyValueList}>
                                    <li><span>Current Stage</span><strong>{workItem.currentStage}</strong></li>
                                    <li><span>Source Locator</span><strong>{workItem.sourceLocator ?? '—'}</strong></li>
                                    <li><span>Cursor</span><strong>{workItem.cursor ? JSON.stringify(workItem.cursor) : '—'}</strong></li>
                                    <li><span>Warnings</span><strong>{workItem.warningCount}</strong></li>
                                    <li><span>Errors</span><strong>{workItem.errorCount}</strong></li>
                                    <li><span>Started</span><strong>{formatDateTime(workItem.startedAt)}</strong></li>
                                  </ul>
                                  <div className={styles.inlineArtifacts}>
                                    {workItem.artifacts.map((artifact) => (
                                      <button key={artifact.id} type="button" className={styles.inlineArtifact} onClick={() => window.open(api.artifactDownloadUrl(artifact.id), '_blank', 'noopener,noreferrer')}>
                                        <FileText size={14} />
                                        <span>{artifact.fileName}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
