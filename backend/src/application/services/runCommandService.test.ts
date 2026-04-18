import { describe, expect, it, vi } from 'vitest';
import { createInMemoryRepositories } from '../../db/memory/index.js';
import { sourceAdapterRegistry } from '../../adapters/index.js';
import { RequestValidationError } from '../../domain/errors.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { MemoryQueueService } from '../../services/memoryQueueService.js';
import { RunActivityService } from './runActivityService.js';
import { RunCommandService } from './runCommandService.js';
import { RunLifecycleService } from './runLifecycleService.js';

describe('RunCommandService', () => {
  it('creates a queued run and records the initial work item event', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repos.sourceRepository, repos.runRepository, queue, runActivityService, runLifecycleService, sourceAdapterRegistry);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      fieldValues: { label: '民法', query: '民法', exactMatch: false },
    });

    expect(run.status).toBe('queued');
    expect(run.workItems).toHaveLength(1);
    expect(run.recentEvents.some((event) => event.eventType === 'work-item-status')).toBe(true);
    expect(streamPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run-created', runId: run.id }));
  });

  it('deletes a stopped run', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repos.sourceRepository, repos.runRepository, queue, runActivityService, runLifecycleService, sourceAdapterRegistry);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      fieldValues: { label: '民法', query: '民法', exactMatch: false },
    });

    await service.cancelRun(run.id);
    await service.deleteRun(run.id);

    await expect(repos.runRepository.getRunDetail(run.id)).resolves.toBeNull();
    expect(streamPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run-removed', runId: run.id }));
  });

  it('rejects deleting a running run', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repos.sourceRepository, repos.runRepository, queue, runActivityService, runLifecycleService, sourceAdapterRegistry);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      fieldValues: { label: '民法', query: '民法', exactMatch: false },
    });

    await repos.runRepository.setRunStatus(run.id, 'running', '工作器執行中');

    await expect(service.deleteRun(run.id)).rejects.toBeInstanceOf(RequestValidationError);
  });

  it('marks the run as failed when queue dispatch fails', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repos.eventRepository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repos.runRepository, runActivityService);
    const queue = {
      start: vi.fn(),
      stop: vi.fn(),
      enqueueTask: vi.fn().mockRejectedValue(new Error('queue unavailable')),
    };
    const service = new RunCommandService(repos.sourceRepository, repos.runRepository, queue, runActivityService, runLifecycleService, sourceAdapterRegistry);

    await expect(service.createRun({
      sourceId: 'moj-laws',
      fieldValues: { label: '民法', query: '民法', exactMatch: false },
    })).rejects.toThrow('工作佇列派發失敗');

    const runs = await repos.runRepository.listRunSummaries();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.summary).toBe('任務派發失敗');
  });
});