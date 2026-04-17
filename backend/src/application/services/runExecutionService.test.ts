import { describe, expect, it, vi } from 'vitest';
import type { AdapterContext, SourceAdapter, SourceAdapterResolver } from '../../adapters/base.js';
import { RunExecutionContextFactory } from '../factories/runExecutionContextFactory.js';
import { InMemoryCrawlRepository } from '../../db/inMemoryCrawlRepository.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { RunActivityService } from './runActivityService.js';
import { RunExecutionService } from './runExecutionService.js';
import { RunLifecycleService } from './runLifecycleService.js';

function createExecutionHarness(run: (context: AdapterContext) => Promise<void>) {
  const repository = new InMemoryCrawlRepository();
  const streamPublisher = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
  const runActivityService = new RunActivityService(repository, streamPublisher);
  const runLifecycleService = new RunLifecycleService(repository, runActivityService);
  const runExecutionContextFactory = new RunExecutionContextFactory(
    repository,
    repository,
    {
      async writeJson() {
        throw new Error('writeJson should not be called in this test');
      },
      async writeMarkdown() {
        throw new Error('writeMarkdown should not be called in this test');
      },
    },
    runActivityService,
    {
      async persistRunLawArtifacts() {
        throw new Error('persistRunLawArtifacts should not be called in this test');
      },
    } as never,
    runLifecycleService,
  );

  const adapter: SourceAdapter = {
    sourceId: 'moj-laws',
    run,
  };

  const adapterResolver: SourceAdapterResolver = {
    get: vi.fn(() => adapter),
  };

  const runExecutionService = new RunExecutionService(
    repository,
    repository,
    runActivityService,
    runExecutionContextFactory,
    runLifecycleService,
    adapterResolver,
  );

  return {
    repository,
    runExecutionService,
    streamPublisher,
    adapterResolver,
  };
}

describe('RunExecutionService', () => {
  it('completes a run through the semantic adapter runtime', async () => {
    const harness = createExecutionHarness(async (context) => {
      await context.beginStage('fetching_index', {
        progress: 10,
        message: '開始下載資料',
        sourceLocator: 'https://example.test/index',
      });
      await context.beginStage('writing_output', {
        progress: 80,
        message: '輸出整理結果中',
        itemsProcessed: 1,
        itemsTotal: 1,
      });
      await context.complete({
        message: '已完成輸出',
        itemsProcessed: 1,
        itemsTotal: 1,
      });
    });

    await harness.repository.ensureSourceCatalog(sourceRegistry.list());
    const runId = await harness.repository.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    await harness.runExecutionService.processRun(runId);

    const run = await harness.repository.getRunDetail(runId);
    expect(run?.status).toBe('completed');
    expect(run?.workItems[0]?.status).toBe('done');
    expect(run?.recentEvents.some((event) => event.eventType === 'run-status' && event.message === '任務已完成。')).toBe(true);
    expect(harness.adapterResolver.get).toHaveBeenCalledWith('moj-laws');
  });

  it('marks a run as failed when the adapter throws', async () => {
    const harness = createExecutionHarness(async (context) => {
      await context.beginStage('fetching_detail', {
        progress: 25,
        message: '開始抓取內容',
        sourceLocator: 'https://example.test/detail',
      });
      throw new Error('來源站台回應異常');
    });

    await harness.repository.ensureSourceCatalog(sourceRegistry.list());
    const runId = await harness.repository.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    await harness.runExecutionService.processRun(runId);

    const run = await harness.repository.getRunDetail(runId);
    expect(run?.status).toBe('failed');
    expect(run?.workItems[0]?.status).toBe('failed');
    expect(run?.recentEvents.some((event) => event.eventType === 'work-item-status' && event.level === 'error' && event.message === '來源站台回應異常')).toBe(true);
    expect(run?.recentEvents.some((event) => event.eventType === 'run-status' && event.message === '任務執行失敗。')).toBe(true);
  });
});