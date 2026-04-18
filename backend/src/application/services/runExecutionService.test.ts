import { describe, expect, it, vi } from 'vitest';
import type { AdapterContext, SourceAdapter, SourceAdapterResolver } from '../../adapters/base.js';
import { RunExecutionContextFactory } from '../factories/runExecutionContextFactory.js';
import { createInMemoryRepositories } from '../../db/memory/index.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { RunActivityService } from './runActivityService.js';
import { RunExecutionService } from './runExecutionService.js';
import { RunLifecycleService } from './runLifecycleService.js';

function createExecutionHarness(run: (context: AdapterContext) => Promise<void>) {
  const repos = createInMemoryRepositories();
  const streamPublisher = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
  const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
  const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);
  const runExecutionContextFactory = new RunExecutionContextFactory(
    repos.runRepository,
    repos.artifactRepository,
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
    repos.stageRepository,
  );

  const adapter: SourceAdapter = {
    sourceId: 'moj-laws',
    buildTargets: () => [{ kind: 'law', label: 'test', query: 'test', exactMatch: false }],
    run,
  };

  const adapterResolver: SourceAdapterResolver = {
    get: vi.fn(() => adapter),
  };

  const runExecutionService = new RunExecutionService(
    repos.runRepository,
    repos.sourceRepository,
    runActivityService,
    runExecutionContextFactory,
    runLifecycleService,
    adapterResolver,
  );

  return {
    repository: repos.runRepository,
    sourceRepository: repos.sourceRepository,
    runExecutionService,
    streamPublisher,
    adapterResolver,
  };
}

describe('RunExecutionService', () => {
  it('completes a run through the semantic adapter runtime', async () => {
    const harness = createExecutionHarness(async (context) => {
      await context.observation.beginStage('fetching_index', {
        progress: 10,
        message: '開始下載資料',
        sourceLocator: 'https://example.test/index',
      });
      await context.observation.beginStage('writing_output', {
        progress: 80,
        message: '輸出整理結果中',
        itemsProcessed: 1,
        itemsTotal: 1,
      });
      await context.observation.complete({
        message: '已完成輸出',
        itemsProcessed: 1,
        itemsTotal: 1,
      });
    });

    await harness.sourceRepository.ensureSourceCatalog(sourceRegistry.list());
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
      await context.observation.beginStage('fetching_detail', {
        progress: 25,
        message: '開始抓取內容',
        sourceLocator: 'https://example.test/detail',
      });
      throw new Error('來源站台回應異常');
    });

    await harness.sourceRepository.ensureSourceCatalog(sourceRegistry.list());
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