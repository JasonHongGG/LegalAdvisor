import { describe, expect, it, vi } from 'vitest';
import { InMemoryCrawlRepository } from '../../db/inMemoryCrawlRepository.js';
import { RequestValidationError } from '../../domain/errors.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { MemoryQueueService } from '../../services/memoryQueueService.js';
import { RunActivityService } from './runActivityService.js';
import { RunCommandService } from './runCommandService.js';
import { RunLifecycleService } from './runLifecycleService.js';

describe('RunCommandService', () => {
  it('creates a queued run and records the initial work item event', async () => {
    const repository = new InMemoryCrawlRepository();
    await repository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repository, queue, runActivityService, runLifecycleService);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    expect(run.status).toBe('queued');
    expect(run.workItems).toHaveLength(1);
    expect(run.recentEvents.some((event) => event.eventType === 'work-item-status')).toBe(true);
    expect(streamPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run-created', runId: run.id }));
  });

  it('deletes a stopped run', async () => {
    const repository = new InMemoryCrawlRepository();
    await repository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repository, queue, runActivityService, runLifecycleService);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    await service.cancelRun(run.id);
    await service.deleteRun(run.id);

    await expect(repository.getRunDetail(run.id)).resolves.toBeNull();
    expect(streamPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'run-removed', runId: run.id }));
  });

  it('rejects deleting a running run', async () => {
    const repository = new InMemoryCrawlRepository();
    await repository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const runActivityService = new RunActivityService(repository, streamPublisher);
    const runLifecycleService = new RunLifecycleService(repository, runActivityService);
    const queue = new MemoryQueueService();
    const service = new RunCommandService(repository, queue, runActivityService, runLifecycleService);

    const run = await service.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    await repository.setRunStatus(run.id, 'running', '工作器執行中');

    await expect(service.deleteRun(run.id)).rejects.toBeInstanceOf(RequestValidationError);
  });
});