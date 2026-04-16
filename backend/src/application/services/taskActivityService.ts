import type { SourceOverviewDto } from '@legaladvisor/shared';
import type { EventRepository } from '../ports/repositories.js';
import type { TaskExecutionReporter, TaskStreamPublisher } from '../ports/runtime.js';
import { createId, isoNow } from '../../utils.js';

export class TaskActivityService implements TaskExecutionReporter {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly streamPublisher: TaskStreamPublisher,
  ) {}

  async appendTaskEvent(
    taskId: string,
    workItemId: string | null,
    eventType: Parameters<EventRepository['appendEvent']>[0]['eventType'],
    level: Parameters<EventRepository['appendEvent']>[0]['level'],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    await this.eventRepository.appendEvent({
      id: createId(),
      taskId,
      workItemId,
      eventType,
      level,
      message,
      details,
      occurredAt: isoNow(),
    });
  }

  publishTaskCreated(taskId: string) {
    this.streamPublisher.publish({ kind: 'task-created', taskId, occurredAt: isoNow() });
  }

  publishTaskUpdated(taskId: string) {
    this.streamPublisher.publish({ kind: 'task-updated', taskId, occurredAt: isoNow() });
  }

  publishSourceUpdated(sourceId: SourceOverviewDto['id']) {
    this.streamPublisher.publish({ kind: 'source-updated', sourceId, occurredAt: isoNow() });
  }
}