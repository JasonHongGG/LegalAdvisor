import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import type { TimelineStep } from '../../features/crawler/domain/types';

type RunTimelineProps = {
  steps: TimelineStep[];
  embedded?: boolean;
};

export function RunTimeline({ steps, embedded = false }: RunTimelineProps) {
  const content = (
    <>
      {steps.length === 0 && <div className={styles.emptyHint}>尚無執行紀錄。</div>}

      <div className={styles.timelineList}>
        {steps.map((step, index) => (
          <article key={step.id} className={clsx(styles.timelineItem, styles[`timeline-${step.stateTone}`])}>
            <div className={styles.timelineIndex}>{index + 1}</div>
            <div className={styles.timelineBody}>
              <div className={styles.timelineTop}>
                <div className={styles.timelineTitleRow}>
                  <strong className={styles.timelineTitleText}>{step.title}</strong>
                  <span className={clsx(styles.timelineState, styles[`timelineState-${step.stateTone}`])}>{step.stateLabel}</span>
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
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className={styles.workstream}>
      <div className={styles.workstreamHeader}>
        <h4>執行明細</h4>
        <span>{steps.length} 個步驟</span>
      </div>
      {content}
    </div>
  );
}