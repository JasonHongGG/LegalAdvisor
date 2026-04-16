import type { TaskDetailDto, TaskSummaryDto, WorkItemDto } from '@legaladvisor/shared';
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

export function describeTaskDuration(task: TaskSummaryDto, nowTimestamp: number) {
  const startedAt = parseTimestamp(task.startedAt);
  if (!startedAt) {
    return '尚未開始';
  }

  const finishedAt = parseTimestamp(task.finishedAt);
  const endAt = finishedAt ?? nowTimestamp;
  const prefix = finishedAt ? '總耗時' : '目前已執行';
  return `${prefix} ${formatDuration(endAt - startedAt)}`;
}

export function buildExecutionTimeline(detail: TaskDetailDto, task: TaskSummaryDto, nowTimestamp: number): TimelineStep[] {
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

export function mapProgressStatus(status: TaskSummaryDto['status'] | WorkItemDto['status']): ProgressTone {
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