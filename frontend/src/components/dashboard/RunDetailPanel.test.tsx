import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunDetailPanel } from './RunDetailPanel';

describe('RunDetailPanel', () => {
  it('switches between timeline and raw event tabs without moving the artifact panel', () => {
    render(
      <RunDetailPanel
        activeRun={{
          id: 'run-1',
          sourceId: 'moj-laws',
          sourceName: '法務部全國法規資料庫',
          status: 'running',
          summary: 'running',
          overallProgress: 50,
          targetCount: 1,
          totalWorkItems: 1,
          completedWorkItems: 0,
          failedWorkItems: 0,
          queuedWorkItems: 0,
          runningWorkItems: 1,
          warningCount: 0,
          errorCount: 0,
          startedAt: '2026-04-16T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-04-16T00:05:00.000Z',
          lastEventAt: '2026-04-16T00:05:00.000Z',
          etaSeconds: 60,
          targets: [{
            id: 'target-1',
            runId: 'run-1',
            targetKind: 'law',
            label: '民法',
            config: { kind: 'law', label: '民法', query: '民法', exactMatch: false },
            createdAt: '2026-04-16T00:00:00.000Z',
          }],
        }}
        artifacts={[{
          id: 'artifact-1',
          runId: 'run-1',
          workItemId: 'work-item-1',
          artifactKind: 'law_article_snapshot',
          artifactRole: 'machine-source',
          contentStatus: 'new',
          canonicalDocumentId: 'doc-1',
          canonicalVersionId: 'ver-1',
          fileName: 'civil-code-articles.json',
          contentType: 'application/json',
          sizeBytes: 128,
          hashSha256: 'hash-1',
          schemaVersion: '1.0.0',
          metadata: {},
          createdAt: '2026-04-16T00:05:00.000Z',
        }]}
        events={[
          {
            id: 'evt-1',
            runId: 'run-1',
            workItemId: null,
            sequenceNo: 1,
            eventType: 'run-status',
            level: 'info',
            message: '工作器開始執行任務。',
            details: {},
            occurredAt: '2026-04-16T00:00:00.000Z',
          },
        ]}
        activeErrorMessage={null}
        executionTimeline={[
          {
            id: 'evt-1',
            title: '工作器開始執行任務。',
            context: '主任務',
            workItemId: null,
            sequenceNo: 1,
            startedAtLabel: '2026/4/16 08:00:00',
            startedAtMs: Date.parse('2026-04-16T00:00:00.000Z'),
            durationLabel: '已執行 5 分',
            stateLabel: '進行中',
            stateTone: 'running',
          },
        ]}
        nowTimestamp={Date.parse('2026-04-16T00:05:00.000Z')}
        activeArtifactId={null}
        isRunViewLoading={false}
        onRunAction={vi.fn()}
        onDeleteRun={vi.fn()}
        onOpenPreview={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: '步驟時間軸' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('工作器開始執行任務。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '原始事件紀錄' }));

    expect(screen.getByRole('tab', { name: '原始事件紀錄' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('civil-code-articles.json')).toBeInTheDocument();
  });
  });