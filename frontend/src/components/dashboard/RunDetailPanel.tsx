import { useState } from 'react';
import type { ArtifactDto, RunEventDto, RunSummaryDto } from '@legaladvisor/shared';
import { AlertTriangle, CirclePause, CirclePlay, RefreshCcw, Trash2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import styles from '../../pages/ScrapingDashboard.module.css';
import { formatDateTime, formatEta, formatStatusLabel } from '../../features/crawler/domain/labels';
import { describeRunDuration } from '../../features/crawler/domain/timeline';
import type { TimelineStep } from '../../features/crawler/domain/types';
import { ArtifactPanel } from './ArtifactPanel';
import { RunEventLog } from './RunEventLog';
import { RunTimeline } from './RunTimeline';
import { Button } from '../ui/Button';

type RunDetailPanelProps = {
  activeRun: RunSummaryDto | null;
  artifacts: ArtifactDto[] | null;
  events: RunEventDto[] | null;
  activeErrorMessage: string | null;
  executionTimeline: TimelineStep[];
  nowTimestamp: number;
  activeArtifactId: string | null;
  isRunViewLoading: boolean;
  onRunAction: (runId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => void;
  onDeleteRun: (runId: string) => void;
  onOpenPreview: (artifact: ArtifactDto) => void;
};

export function RunDetailPanel({
  activeRun,
  artifacts,
  events,
  activeErrorMessage,
  executionTimeline,
  nowTimestamp,
  activeArtifactId,
  isRunViewLoading,
  onRunAction,
  onDeleteRun,
  onOpenPreview,
}: RunDetailPanelProps) {
  const [activeDetailTab, setActiveDetailTab] = useState<'timeline' | 'events'>('timeline');

  if (!activeRun) {
    return <div className={styles.emptyPreview}>建立任務後，這裡會顯示詳細進度與輸出檔案。</div>;
  }

  const versionSummary = artifacts ? summarizeLawVersionStatus(artifacts) : null;

  return (
    <>
      <div className={styles.previewHeader}>
        <div className={styles.previewHeading}>
          <div className={styles.previewTitleRow}>
            <h3 className={styles.previewTitle}>{activeRun.targets.map((target) => target.label).join('、')}</h3>
            <span className={clsx(styles.runStatusBadge, styles[`run-${activeRun.status}`])}>{formatStatusLabel(activeRun.status)}</span>
          </div>
          <p className={styles.previewSubline}>
            {activeRun.sourceName} · 開始時間 {formatDateTime(activeRun.startedAt)} · {describeRunDuration(activeRun, nowTimestamp)}
            {!activeRun.finishedAt && ` · ETA ${formatEta(activeRun.etaSeconds)}`}
          </p>
          {versionSummary && <p className={styles.previewSubline}>{versionSummary}</p>}
        </div>

        <div className={styles.previewActions}>
          {['queued', 'running', 'dispatching'].includes(activeRun.status) && (
            <Button variant="secondary" size="sm" icon={<CirclePause size={16} />} onClick={() => onRunAction(activeRun.id, 'pause')}>
              暫停
            </Button>
          )}
          {activeRun.status === 'paused' && (
            <Button variant="secondary" size="sm" icon={<CirclePlay size={16} />} onClick={() => onRunAction(activeRun.id, 'resume')}>
              繼續
            </Button>
          )}
          {activeRun.failedWorkItems > 0 && (
            <Button variant="secondary" size="sm" icon={<RefreshCcw size={16} />} onClick={() => onRunAction(activeRun.id, 'retry')}>
              重試失敗項目
            </Button>
          )}
          {['cancelled', 'completed', 'partial_success', 'failed'].includes(activeRun.status) && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={16} />}
              onClick={() => {
                if (window.confirm('刪除後無法復原。確定要刪除這筆任務嗎？')) {
                  onDeleteRun(activeRun.id);
                }
              }}
            >
              刪除
            </Button>
          )}
          {!['cancelled', 'completed', 'failed'].includes(activeRun.status) && (
            <Button variant="danger" size="sm" icon={<XCircle size={16} />} onClick={() => onRunAction(activeRun.id, 'cancel')}>
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

      {isRunViewLoading && <div className={styles.emptyPreview}>讀取任務詳情中...</div>}

      {!isRunViewLoading && artifacts && events && (
        <div className={styles.previewBody}>
          <div className={styles.workstream}>
            <div className={styles.workstreamHeader}>
              <div className={styles.workstreamHeaderTitle}>
                <h4>執行明細</h4>
                <span>{activeDetailTab === 'timeline' ? `${executionTimeline.length} 個步驟` : `${events.length} 筆事件`}</span>
              </div>
              <div className={styles.workstreamTabs} role="tablist" aria-label="執行明細檢視切換">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDetailTab === 'timeline'}
                  className={clsx(styles.workstreamTab, activeDetailTab === 'timeline' && styles.workstreamTabActive)}
                  onClick={() => setActiveDetailTab('timeline')}
                >
                  步驟時間軸
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDetailTab === 'events'}
                  className={clsx(styles.workstreamTab, activeDetailTab === 'events' && styles.workstreamTabActive)}
                  onClick={() => setActiveDetailTab('events')}
                >
                  原始事件紀錄
                </button>
              </div>
            </div>

            <div className={styles.workstreamBody}>
              {activeDetailTab === 'timeline'
                ? <RunTimeline steps={executionTimeline} embedded />
                : <RunEventLog events={events} />}
            </div>
          </div>
          <ArtifactPanel
            runId={activeRun.id}
            artifacts={artifacts}
            activeArtifactId={activeArtifactId}
            onOpenPreview={onOpenPreview}
          />
        </div>
      )}
    </>
  );
}

function summarizeLawVersionStatus(artifacts: ArtifactDto[]) {
  const canonicalVersions = new Map<string, 'new' | 'reused'>();

  for (const artifact of artifacts) {
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