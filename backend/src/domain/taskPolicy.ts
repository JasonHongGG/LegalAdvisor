import type { TaskStatus, WorkItemDto, WorkItemStatus } from '@legaladvisor/shared';

export const FINAL_TASK_STATUSES = new Set<TaskStatus>(['completed', 'partial_success', 'failed', 'cancelled']);
export const EXECUTABLE_WORK_ITEM_STATUSES = new Set<WorkItemStatus>(['pending', 'failed']);

export function isTaskExecutionBlocked(status: TaskStatus) {
  return status === 'paused' || status === 'cancelled';
}

export function isTaskTerminal(status: TaskStatus) {
  return FINAL_TASK_STATUSES.has(status);
}

export function isRunnableWorkItemStatus(status: WorkItemStatus) {
  return EXECUTABLE_WORK_ITEM_STATUSES.has(status);
}

export function deriveTaskStatus(workItems: WorkItemDto[], currentStatus: TaskStatus): TaskStatus {
  if (currentStatus === 'paused' || currentStatus === 'cancelled' || currentStatus === 'throttled') {
    return currentStatus;
  }

  const total = workItems.length;
  const completed = workItems.filter((item) => item.status === 'done').length;
  const failed = workItems.filter((item) => item.status === 'failed').length;
  const skipped = workItems.filter((item) => item.status === 'skipped').length;
  const running = workItems.filter((item) => !['pending', 'done', 'failed', 'skipped'].includes(item.status)).length;

  if (total > 0 && completed + failed + skipped === total) {
    if (failed === 0) {
      return 'completed';
    }
    if (completed > 0 || skipped > 0) {
      return 'partial_success';
    }
    return 'failed';
  }

  if (running > 0) {
    return 'running';
  }

  return 'queued';
}