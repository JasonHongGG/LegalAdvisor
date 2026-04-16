import type { TaskSummaryDto } from '@legaladvisor/shared';
import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import { ProgressBar } from '../ui/ProgressBar';
import { formatDateTime, formatStatusLabel } from '../../features/crawler/domain/labels';
import { describeTaskDuration, mapProgressStatus } from '../../features/crawler/domain/timeline';

type TaskRailProps = {
  isLoading: boolean;
  tasks: TaskSummaryDto[];
  activeTaskId: string | null;
  nowTimestamp: number;
  onSelectTask: (taskId: string) => void;
};

export function TaskRail({ isLoading, tasks, activeTaskId, nowTimestamp, onSelectTask }: TaskRailProps) {
  return (
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
            onClick={() => onSelectTask(task.id)}
          >
            <div className={styles.taskRailTop}>
              <strong className={styles.taskRailTitle}>{task.targets.map((target) => target.label).join('、')}</strong>
              <div className={styles.taskRailStatusGroup}>
                <span className={clsx(styles.taskStatusBadge, styles[`task-${task.status}`])}>{formatStatusLabel(task.status)}</span>
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
  );
}