import { describe, expect, it, vi } from 'vitest';
import { InMemoryCrawlRepository } from '../../db/inMemoryCrawlRepository.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { MemoryQueueService } from '../../services/memoryQueueService.js';
import { TaskActivityService } from './taskActivityService.js';
import { TaskCommandService } from './taskCommandService.js';

describe('TaskCommandService', () => {
  it('creates a queued task and records the initial work item event', async () => {
    const repository = new InMemoryCrawlRepository();
    await repository.ensureSourceCatalog(sourceRegistry.list());

    const streamPublisher = {
      subscribe: vi.fn(),
      publish: vi.fn(),
    };

    const taskActivityService = new TaskActivityService(repository, streamPublisher);
    const queue = new MemoryQueueService();
    const service = new TaskCommandService(repository, queue, taskActivityService);

    const task = await service.createTask({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: false }],
    });

    expect(task.status).toBe('queued');
    expect(task.workItems).toHaveLength(1);
    expect(task.recentEvents.some((event) => event.eventType === 'work-item-status')).toBe(true);
    expect(streamPublisher.publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task-created', taskId: task.id }));
  });
});