import type { RunSummaryDto, RunTimelineEntryDto, WorkItemDto } from '@legaladvisor/shared';
import { formatDateTime, formatDuration, formatStatusLabel } from './labels';
import type { ProgressTone, TimelineStep } from './types';

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function describeWorkItemStep(workItem: WorkItemDto) {
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

export function describeRunDuration(run: RunSummaryDto, nowTimestamp: number) {
  const startedAt = parseTimestamp(run.startedAt);
  if (!startedAt) {
    return '尚未開始';
  }

  const finishedAt = parseTimestamp(run.finishedAt);
  const endAt = finishedAt ?? nowTimestamp;
  const prefix = finishedAt ? '總耗時' : '目前已執行';
  return `${prefix} ${formatDuration(endAt - startedAt)}`;
}

export function buildExecutionTimeline(entries: RunTimelineEntryDto[], nowTimestamp: number): TimelineStep[] {
  return [...entries]
    .sort((left, right) => left.sequenceNo - right.sequenceNo)
    .map((entry) => {
      const startedAt = parseTimestamp(entry.occurredAt) ?? nowTimestamp;
      const endedAt = parseTimestamp(entry.endedAt) ?? (entry.stateTone === 'running' ? nowTimestamp : startedAt);

      return {
        id: entry.id,
        title: entry.title,
        context: entry.context,
        workItemId: entry.workItemId,
        sequenceNo: entry.sequenceNo,
        startedAtLabel: formatDateTime(entry.occurredAt),
        startedAtMs: startedAt,
        durationLabel: `${entry.stateTone === 'running' ? '已執行' : '耗時'} ${formatDuration(Math.max(endedAt - startedAt, 0))}`,
        stateLabel: entry.stateLabel,
        stateTone: entry.stateTone,
      };
    });
}

export function mapProgressStatus(status: RunSummaryDto['status'] | WorkItemDto['status']): ProgressTone {
  if (['completed', 'done'].includes(status)) {
    return 'success';
  }
  if (['failed', 'cancelled'].includes(status)) {
    return 'error';
  }
  if (['queued', 'draft', 'pending', 'paused'].includes(status)) {
    return 'idle';
  }
  return 'running';
}