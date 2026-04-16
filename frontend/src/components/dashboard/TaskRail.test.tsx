import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRail } from './TaskRail';

describe('TaskRail', () => {
  it('renders tasks and forwards selection events', () => {
    const onSelectTask = vi.fn();

    render(
      <TaskRail
        isLoading={false}
        activeTaskId={null}
        nowTimestamp={Date.now()}
        onSelectTask={onSelectTask}
        tasks={[
          {
            id: 'task-1',
            sourceId: 'moj-laws',
            sourceName: '全國法規',
            status: 'queued',
            summary: '等待中',
            overallProgress: 0,
            targetCount: 1,
            totalWorkItems: 1,
            completedWorkItems: 0,
            failedWorkItems: 0,
            queuedWorkItems: 1,
            runningWorkItems: 0,
            warningCount: 0,
            errorCount: 0,
            startedAt: null,
            finishedAt: null,
            updatedAt: '2026-04-16T00:00:00.000Z',
            lastEventAt: null,
            etaSeconds: null,
            targets: [
              {
                id: 'target-1',
                taskId: 'task-1',
                targetKind: 'law',
                label: '民法',
                config: { kind: 'law', label: '民法', query: '民法', exactMatch: false },
                createdAt: '2026-04-16T00:00:00.000Z',
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /民法/i }));
    expect(onSelectTask).toHaveBeenCalledWith('task-1');
  });
});