import type {
  RunEventDto as CrawlEvent,
  RunTimelineEntryDto as CrawlTimelineEntry,
} from '@legaladvisor/shared';
import type {
  EventRepository,
  InsertEventInput,
  StageRepository,
} from '../../application/ports/repositories.js';
import { type InMemoryDataStore, clone, nowIso } from './inMemoryDataStore.js';

export class InMemoryEventRepository implements EventRepository {
  constructor(
    private readonly store: InMemoryDataStore,
    private readonly stageRepo: StageRepository,
  ) {}

  async appendEvent(input: InsertEventInput) {
    const state = this.store.requireRunState(input.runId);
    const occurredAt = input.occurredAt ?? nowIso();
    const event = {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      sequenceNo: this.store.nextEventSequenceNo,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
      details: clone(input.details),
      occurredAt,
    } satisfies CrawlEvent;
    this.store.nextEventSequenceNo += 1;
    state.events.push(event);
    state.summary.lastEventAt = occurredAt;
    state.summary.updatedAt = occurredAt;
    return clone(event);
  }

  async listRunEvents(runId: string, options?: { afterSequenceNo?: number; limit?: number }) {
    const state = this.store.requireRunState(runId);
    const afterSequenceNo = options?.afterSequenceNo ?? 0;
    const limit = options?.limit ?? 500;
    return state.events
      .filter((event) => event.sequenceNo > afterSequenceNo)
      .slice(-limit)
      .map((event) => clone(event));
  }

  async listRunTimelineEntries(runId: string, _options?: { afterSequenceNo?: number; limit?: number }) {
    return this.stageRepo.listRunStages(runId);
  }
}
