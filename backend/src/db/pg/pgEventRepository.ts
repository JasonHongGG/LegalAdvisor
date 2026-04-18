import type {
  RunEventDto as CrawlEvent,
  RunTimelineEntryDto as CrawlTimelineEntry,
  EventLevel,
  EventType,
} from '@legaladvisor/shared';
import type {
  EventRepository,
  InsertEventInput,
  StageRepository,
} from '../../application/ports/repositories.js';
import { PgBase, normalizeEventType, parseJson, toIsoString } from './helpers.js';

export class PgEventRepository extends PgBase implements EventRepository {
  constructor(
    db: import('pg').Pool,
    schema: string,
    private readonly stageRepo: StageRepository,
  ) {
    super(db, schema);
  }

  async appendEvent(input: InsertEventInput) {
    const result = await this.db.query(
      `
        insert into ${this.table('crawl_events')} (
          id, run_id, work_item_id, event_type, level, message, details, occurred_at
        ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        returning *
      `,
      [
        input.id,
        input.runId,
        input.workItemId,
        input.eventType,
        input.level,
        input.message,
        JSON.stringify(input.details),
        input.occurredAt ?? new Date().toISOString(),
      ],
    );
    await this.db.query(`update ${this.table('crawl_runs')} set last_event_at = now(), updated_at = now() where id = $1`, [input.runId]);
    return this.mapEvent(result.rows[0]);
  }

  async listRunEvents(runId: string, options?: { afterSequenceNo?: number; limit?: number }) {
    const values: unknown[] = [runId];
    const filters = ['run_id = $1'];

    if (options?.afterSequenceNo !== undefined) {
      values.push(options.afterSequenceNo);
      filters.push(`sequence_no > $${values.length}`);
    }

    const limit = options?.limit ?? 500;
    values.push(limit);

    const result = await this.db.query(
      `
        select *
        from ${this.table('crawl_events')}
        where ${filters.join(' and ')}
        order by sequence_no asc
        limit $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => this.mapEvent(row));
  }

  async listRunTimelineEntries(runId: string, _options?: { afterSequenceNo?: number; limit?: number }) {
    return this.stageRepo.listRunStages(runId);
  }

  private mapEvent(row: Record<string, unknown>): CrawlEvent {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      workItemId: row.work_item_id ? String(row.work_item_id) : null,
      sequenceNo: Number(row.sequence_no ?? 0),
      eventType: normalizeEventType(row.event_type),
      level: row.level as EventLevel,
      message: String(row.message),
      details: parseJson<Record<string, unknown>>(row.details, {}),
      occurredAt: toIsoString(row.occurred_at) ?? new Date().toISOString(),
    };
  }
}
