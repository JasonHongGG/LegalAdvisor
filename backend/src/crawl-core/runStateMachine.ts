import type { RunStatus } from '@legaladvisor/shared';

const transitionMap: Record<RunStatus, RunStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['dispatching', 'running', 'paused', 'failed', 'cancelled'],
  dispatching: ['running', 'paused', 'failed', 'cancelled'],
  running: ['paused', 'completed', 'partial_success', 'failed', 'cancelled'],
  paused: ['queued', 'cancelled'],
  completed: [],
  partial_success: ['queued'],
  failed: ['queued'],
  cancelled: [],
};

export function canTransitionRunStatus(currentStatus: RunStatus, nextStatus: RunStatus) {
  return currentStatus === nextStatus || transitionMap[currentStatus].includes(nextStatus);
}
