import type { TaskDetailDto, TaskSummaryDto } from '@legaladvisor/shared';
import { AlertTriangle, CirclePause, CirclePlay, RefreshCcw, Trash2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import { formatDateTime, formatEta, formatStatusLabel } from '../../features/crawler/domain/labels';
import { describeTaskDuration } from '../../features/crawler/domain/timeline';
import type { TimelineStep } from '../../features/crawler/domain/types';
import { ArtifactPanel } from './ArtifactPanel';
import { TaskTimeline } from './TaskTimeline';
import { Button } from '../ui/Button';

type TaskDetailPanelProps = {
  activeTask: TaskSummaryDto | null;
  taskDetail: TaskDetailDto | null;
  activeErrorMessage: string | null;
  executionTimeline: TimelineStep[];
  nowTimestamp: number;
  activeArtifactId: string | null;
  onTaskAction: (taskId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => void;
  onDeleteTask: (taskId: string) => void;
  onOpenPreview: (artifact: TaskDetailDto['artifacts'][number]) => void;
};

export function TaskDetailPanel({
  activeTask,
  taskDetail,
  activeErrorMessage,
  executionTimeline,
  nowTimestamp,
  activeArtifactId,
  onTaskAction,
  onDeleteTask,
  onOpenPreview,
}: TaskDetailPanelProps) {
  if (!activeTask) {
    return <div className={styles.emptyPreview}>建立任務後，這裡會顯示詳細進度與輸出檔案。</div>;
  }

  const versionSummary = taskDetail ? summarizeLawVersionStatus(taskDetail) : null;

  return (
    <>
      <div className={styles.previewHeader}>
        <div className={styles.previewHeading}>
          <div className={styles.previewTitleRow}>
            <h3 className={styles.previewTitle}>{activeTask.targets.map((target) => target.label).join('、')}</h3>
            <span className={clsx(styles.taskStatusBadge, styles[`task-${activeTask.status}`])}>{formatStatusLabel(activeTask.status)}</span>
          </div>
          <p className={styles.previewSubline}>
            {activeTask.sourceName} · 開始時間 {formatDateTime(activeTask.startedAt)} · {describeTaskDuration(activeTask, nowTimestamp)}
            {!activeTask.finishedAt && ` · ETA ${formatEta(activeTask.etaSeconds)}`}
          </p>
          {versionSummary && <p className={styles.previewSubline}>{versionSummary}</p>}
        </div>

        <div className={styles.previewActions}>
          {['queued', 'running', 'dispatching'].includes(activeTask.status) && (
            <Button variant="secondary" size="sm" icon={<CirclePause size={16} />} onClick={() => onTaskAction(activeTask.id, 'pause')}>
              暫停
            </Button>
          )}
          {activeTask.status === 'paused' && (
            <Button variant="secondary" size="sm" icon={<CirclePlay size={16} />} onClick={() => onTaskAction(activeTask.id, 'resume')}>
              繼續
            </Button>
          )}
          {activeTask.failedWorkItems > 0 && (
            <Button variant="secondary" size="sm" icon={<RefreshCcw size={16} />} onClick={() => onTaskAction(activeTask.id, 'retry')}>
              重試失敗項目
            </Button>
          )}
          {['cancelled', 'completed', 'partial_success', 'failed'].includes(activeTask.status) && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={16} />}
              onClick={() => {
                if (window.confirm('刪除後無法復原。確定要刪除這筆任務嗎？')) {
                  onDeleteTask(activeTask.id);
                }
              }}
            >
              刪除
            </Button>
          )}
          {!['cancelled', 'completed', 'failed'].includes(activeTask.status) && (
            <Button variant="danger" size="sm" icon={<XCircle size={16} />} onClick={() => onTaskAction(activeTask.id, 'cancel')}>
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

      {!taskDetail && <div className={styles.emptyPreview}>讀取任務詳情中...</div>}

      {taskDetail && (
        <div className={styles.previewBody}>
          <TaskTimeline steps={executionTimeline} />
          <ArtifactPanel
            taskId={activeTask.id}
            artifacts={taskDetail.artifacts}
            activeArtifactId={activeArtifactId}
            onOpenPreview={onOpenPreview}
          />
        </div>
      )}
    </>
  );
}

function summarizeLawVersionStatus(taskDetail: TaskDetailDto) {
  const canonicalVersions = new Map<string, 'new' | 'reused'>();

  for (const artifact of taskDetail.artifacts) {
    if (!artifact.canonicalVersionId) {
      continue;
    }

    const current = canonicalVersions.get(artifact.canonicalVersionId);
    if (current === 'new' || artifact.contentStatus === 'new') {
      canonicalVersions.set(artifact.canonicalVersionId, 'new');
      continue;
    }

    if (artifact.contentStatus === 'reused') {
      canonicalVersions.set(artifact.canonicalVersionId, 'reused');
    }
  }

  if (canonicalVersions.size === 0) {
    return null;
  }

  const newCount = [...canonicalVersions.values()].filter((status) => status === 'new').length;
  const reusedCount = [...canonicalVersions.values()].filter((status) => status === 'reused').length;
  return `法條版本結果 · 新寫入 ${newCount} 筆 · 重用既有版本 ${reusedCount} 筆`;
}