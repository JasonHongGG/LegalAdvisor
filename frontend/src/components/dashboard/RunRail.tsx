import type { RunSummaryDto } from '@legaladvisor/shared';
import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import { ProgressBar } from '../ui/ProgressBar';
import { ScrollableRail } from '../ui/ScrollableRail';
import { formatDateTime, formatStatusLabel } from '../../features/crawler/domain/labels';
import { describeRunDuration, mapProgressStatus } from '../../features/crawler/domain/timeline';

type RunRailProps = {
  isLoading: boolean;
  runs: RunSummaryDto[];
  activeRunId: string | null;
  nowTimestamp: number;
  onSelectRun: (runId: string) => void;
};

export function RunRail({ isLoading, runs, activeRunId, nowTimestamp, onSelectRun }: RunRailProps) {
  return (
    <ScrollableRail orientation="vertical" className={styles.runRail}>
      {isLoading && <div className={styles.emptyState}>載入中...</div>}
      {!isLoading && runs.length === 0 && <div className={styles.emptyState}>尚未建立任何爬取任務。</div>}
      {runs.map((run) => {
        const isActive = run.id === activeRunId;

        return (
          <button
            key={run.id}
            type="button"
            className={clsx(styles.runRailItem, isActive && styles.runRailItemActive)}
            onClick={() => onSelectRun(run.id)}
          >
            <div className={styles.runRailTop}>
              <strong className={styles.runRailTitle}>{run.targets.map((target) => target.label).join('、')}</strong>
              <div className={styles.runRailStatusGroup}>
                <span className={clsx(styles.runStatusBadge, styles[`run-${run.status}`])}>{formatStatusLabel(run.status)}</span>
                <span className={styles.runRailDuration}>{describeRunDuration(run, nowTimestamp)}</span>
              </div>
            </div>

            <div className={styles.runRailMetaRow}>
              <span className={styles.runUpdatedAt}>{formatDateTime(run.updatedAt)}</span>
              <span className={styles.runRailSource}>{run.sourceName}</span>
            </div>
            <ProgressBar
              progress={run.overallProgress}
              status={mapProgressStatus(run.status)}
              label={`${run.completedWorkItems}/${run.totalWorkItems} 已完成`}
            />
          </button>
        );
      })}
    </ScrollableRail>
  );
}