import type { TaskDetailDto, TaskSummaryDto } from '@legaladvisor/shared';
import { AlertTriangle, CirclePause, CirclePlay, RefreshCcw, XCircle } from 'lucide-react';
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
  onOpenPreview,
}: TaskDetailPanelProps) {
  if (!activeTask) {
    return <div className={styles.emptyPreview}>建立任務後，這裡會顯示詳細進度與輸出檔案。</div>;
  }

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
        </div>

        <div className={styles.previewActions}>
          {['queued', 'running', 'dispatching', 'throttled'].includes(activeTask.status) && (
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