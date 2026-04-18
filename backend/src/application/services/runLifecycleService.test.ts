import { describe, expect, it, vi } from 'vitest';
import { createInMemoryRepositories } from '../../db/memory/index.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { RunActivityService } from './runActivityService.js';
import { RunLifecycleService } from './runLifecycleService.js';

describe('RunLifecycleService', () => {
  it('records a terminal run-status event when recompute transitions the run to completed', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);

    const runId = await repos.runRepository.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    await runLifecycleService.setRunStatus(runId, 'running', {
      summary: '工作器執行中',
      eventMessage: '工作器開始執行任務。',
    });

    const run = await repos.runRepository.getRunDetail(runId);
    const workItemId = run?.workItems[0]?.id;
    if (!workItemId) {
      throw new Error('expected a work item to exist');
    }

    await repos.runRepository.updateWorkItem(workItemId, {
      status: 'done',
      progress: 100,
      current_stage: 'done',
      last_message: '完成 1 部法規輸出',
      items_processed: 1,
      items_total: 1,
      started_at: '2026-04-16T00:00:00.000Z',
      finished_at: '2026-04-16T00:05:00.000Z',
    });

    await runLifecycleService.recomputeRun(runId);

    const nextRun = await repos.runRepository.getRunDetail(runId);
    expect(nextRun?.status).toBe('completed');
    expect(nextRun?.recentEvents.some((event) => event.eventType === 'run-status' && event.message === '任務已完成。')).toBe(true);
  });
});