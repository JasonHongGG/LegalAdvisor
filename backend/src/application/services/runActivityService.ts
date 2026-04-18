import type { SourceOverviewDto } from '@legaladvisor/shared';
import type { EventRepository } from '../ports/repositories.js';
import type { RunExecutionReporter, RunStreamPublisher } from '../ports/runtime.js';
import { createId, isoNow } from '../../utils.js';

export class RunActivityService implements RunExecutionReporter {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly streamPublisher: RunStreamPublisher,
  ) {}

  async appendRunEvent(
    runId: string,
    workItemId: string | null,
    eventType: Parameters<EventRepository['appendEvent']>[0]['eventType'],
    level: Parameters<EventRepository['appendEvent']>[0]['level'],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    const event = await this.eventRepository.appendEvent({
      id: createId(),
      runId: runId,
      workItemId,
      eventType,
      level,
      message,
      details,
      occurredAt: isoNow(),
    });

    if (event.eventType !== 'log') {
      this.streamPublisher.publish({
        kind: 'run-view-updated',
        runId: runId,
        occurredAt: event.occurredAt,
      });
    }

    return { sequenceNo: event.sequenceNo };
  }

  publishRunCreated(runId: string) {
    this.streamPublisher.publish({ kind: 'run-created', runId: runId, occurredAt: isoNow() });
  }

  publishRunRemoved(runId: string) {
    this.streamPublisher.publish({ kind: 'run-removed', runId: runId, occurredAt: isoNow() });
  }

  publishRunOverviewUpdated(runId: string) {
    this.streamPublisher.publish({ kind: 'run-overview-updated', runId: runId, occurredAt: isoNow() });
  }

  publishRunViewUpdated(runId: string) {
    this.streamPublisher.publish({ kind: 'run-view-updated', runId: runId, occurredAt: isoNow() });
  }

  publishSourceUpdated(sourceId: SourceOverviewDto['id']) {
    this.streamPublisher.publish({ kind: 'source-updated', sourceId, occurredAt: isoNow() });
  }
}