import { describe, expect, it } from 'vitest';
import { buildExecutionTimeline } from './timeline';

describe('buildExecutionTimeline', () => {
  it('maps immutable timeline entries without mixing live work item state', () => {
    const steps = buildExecutionTimeline(
      [
        {
          id: 'evt-1',
          runId: 'run-1',
          workItemId: 'work-item-1',
          sequenceNo: 1,
          eventType: 'work-item-status',
          level: 'info',
          title: '工作器開始執行任務。',
          context: '項目：民法',
          stateLabel: '進行中',
          stateTone: 'running',
          occurredAt: '2026-04-16T00:00:00.000Z',
          endedAt: null,
        },
        {
          id: 'evt-2',
          runId: 'run-1',
          workItemId: 'work-item-1',
          sequenceNo: 2,
          eventType: 'artifact-emitted',
          level: 'info',
          title: '已完成民法的法規版本處理。',
          context: '項目：民法',
          stateLabel: '完成',
          stateTone: 'done',
          occurredAt: '2026-04-16T00:05:00.000Z',
          endedAt: '2026-04-16T00:05:00.000Z',
        },
      ],
      Date.parse('2026-04-16T00:06:00.000Z'),
    );

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: 'evt-1',
      title: '工作器開始執行任務。',
      stateLabel: '進行中',
      stateTone: 'running',
    });
    expect(steps[1]).toMatchObject({
      id: 'evt-2',
      title: '已完成民法的法規版本處理。',
      stateLabel: '完成',
      stateTone: 'done',
    });
  });
});