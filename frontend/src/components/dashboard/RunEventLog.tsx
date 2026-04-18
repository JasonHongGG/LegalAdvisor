import type { RunEventDto } from '@legaladvisor/shared';
import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import { formatDateTime } from '../../features/crawler/domain/labels';

type RunEventLogProps = {
  events: RunEventDto[];
};

const EVENT_LEVEL_LABELS = {
  info: '資訊',
  warning: '警告',
  error: '錯誤',
} as const;

export function RunEventLog({ events }: RunEventLogProps) {
  if (events.length === 0) {
    return <div className={styles.emptyHint}>尚無系統事件。</div>;
  }

  return (
    <div className={styles.eventLogList}>
      {events.map((event) => (
        <article key={event.id} className={styles.eventLogItem}>
          <div className={styles.eventLogTop}>
            <div className={styles.eventLogTitleRow}>
              <span className={styles.eventLogSequence}>#{event.sequenceNo}</span>
              <strong className={styles.eventLogTitle}>{event.message}</strong>
            </div>
            <span className={clsx(styles.eventLogLevel, styles[`eventLogLevel-${event.level}`])}>
              {EVENT_LEVEL_LABELS[event.level]}
            </span>
          </div>
          <div className={styles.eventLogMeta}>
            <span>{formatDateTime(event.occurredAt)}</span>
            <span>{event.eventType}</span>
            <span>{event.workItemId ? `項目 ${event.workItemId}` : '主任務'}</span>
          </div>
        </article>
      ))}
    </div>
  );
}