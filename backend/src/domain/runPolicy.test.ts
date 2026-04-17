import { describe, expect, it } from 'vitest';
import { deriveRunStatus, isRunnableWorkItemStatus } from './runPolicy.js';

describe('runPolicy', () => {
  it('derives partial success when done and failed items coexist', () => {
    const status = deriveRunStatus(
      [
        {
          id: '1',
          runId: 'run-1',
          runTargetId: 'target-1',
          sequenceNo: 1,
          label: 'item-1',
          status: 'done',
          progress: 100,
          currentStage: 'done',
          sourceLocator: null,
          cursor: null,
          lastMessage: 'ok',
          retryCount: 0,
          warningCount: 0,
          errorCount: 0,
          itemsProcessed: 1,
          itemsTotal: 1,
          startedAt: null,
          finishedAt: null,
          updatedAt: '2026-04-16T00:00:00.000Z',
          artifacts: [],
          recentEvents: [],
        },
        {
          id: '2',
          runId: 'run-1',
          runTargetId: 'target-2',
          sequenceNo: 2,
          label: 'item-2',
          status: 'failed',
          progress: 100,
          currentStage: 'failed',
          sourceLocator: null,
          cursor: null,
          lastMessage: 'boom',
          retryCount: 0,
          warningCount: 0,
          errorCount: 1,
          itemsProcessed: 1,
          itemsTotal: 1,
          startedAt: null,
          finishedAt: null,
          updatedAt: '2026-04-16T00:00:00.000Z',
          artifacts: [],
          recentEvents: [],
        },
      ],
      'running',
    );

    expect(status).toBe('partial_success');
  });

  it('marks only pending and failed items as runnable', () => {
    expect(isRunnableWorkItemStatus('pending')).toBe(true);
    expect(isRunnableWorkItemStatus('failed')).toBe(true);
    expect(isRunnableWorkItemStatus('done')).toBe(false);
  });
});