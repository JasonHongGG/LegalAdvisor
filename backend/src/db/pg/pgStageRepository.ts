import type { RunTimelineEntryDto as CrawlTimelineEntry } from '@legaladvisor/shared';
import type { InsertStageInput, StageRepository, UpdateStageInput } from '../../application/ports/repositories.js';
import { PgBase, toIsoString } from './helpers.js';

export class PgStageRepository extends PgBase implements StageRepository {
  async insertStage(input: InsertStageInput) {
    await this.db.query(
      `
        insert into ${this.table('crawl_work_item_stages')} (
          id, run_id, work_item_id, stage_name, status, message, progress,
          items_processed, items_total, source_locator, started_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        input.id,
        input.runId,
        input.workItemId,
        input.stageName,
        input.status,
        input.message,
        input.progress ?? 0,
        input.itemsProcessed ?? 0,
        input.itemsTotal ?? 0,
        input.sourceLocator ?? null,
        input.startedAt ?? new Date().toISOString(),
      ],
    );
  }

  async updateStage(stageId: string, patch: UpdateStageInput) {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (patch.status !== undefined) {
      sets.push(`status = $${paramIndex++}`);
      values.push(patch.status);
    }
    if (patch.message !== undefined) {
      sets.push(`message = $${paramIndex++}`);
      values.push(patch.message);
    }
    if (patch.progress !== undefined) {
      sets.push(`progress = $${paramIndex++}`);
      values.push(patch.progress);
    }
    if (patch.itemsProcessed !== undefined) {
      sets.push(`items_processed = $${paramIndex++}`);
      values.push(patch.itemsProcessed);
    }
    if (patch.itemsTotal !== undefined) {
      sets.push(`items_total = $${paramIndex++}`);
      values.push(patch.itemsTotal);
    }
    if (patch.sourceLocator !== undefined) {
      sets.push(`source_locator = $${paramIndex++}`);
      values.push(patch.sourceLocator);
    }
    if (patch.endedAt !== undefined) {
      sets.push(`ended_at = $${paramIndex++}`);
      values.push(patch.endedAt);
    }

    if (sets.length === 0) return;

    values.push(stageId);
    await this.db.query(
      `update ${this.table('crawl_work_item_stages')} set ${sets.join(', ')} where id = $${paramIndex}`,
      values,
    );
  }

  async getActiveStage(workItemId: string) {
    const result = await this.db.query(
      `select id, stage_name from ${this.table('crawl_work_item_stages')}
       where work_item_id = $1 and ended_at is null
       order by sequence_no desc limit 1`,
      [workItemId],
    );
    if (!result.rows[0]) return null;
    return { id: String(result.rows[0].id), stageName: String(result.rows[0].stage_name) };
  }

  async closeActiveStage(workItemId: string, endedAt: string) {
    await this.db.query(
      `update ${this.table('crawl_work_item_stages')}
       set status = 'completed', ended_at = $2
       where work_item_id = $1 and ended_at is null`,
      [workItemId, endedAt],
    );
  }

  async listRunStages(runId: string): Promise<CrawlTimelineEntry[]> {
    const result = await this.db.query(
      `select * from ${this.table('crawl_work_item_stages')}
       where run_id = $1
       order by sequence_no asc`,
      [runId],
    );
    return result.rows.map((row) => this.mapStageToTimelineEntry(row));
  }

  private mapStageToTimelineEntry(row: Record<string, unknown>): CrawlTimelineEntry {
    const status = String(row.status ?? 'running');
    const endedAt = toIsoString(row.ended_at);
    let stateTone: CrawlTimelineEntry['stateTone'] = 'running';
    let stateLabel = '進行中';
    if (status === 'completed') {
      stateTone = 'done';
      stateLabel = '完成';
    } else if (status === 'failed') {
      stateTone = 'failed';
      stateLabel = '失敗';
    }

    const itemsProcessed = Number(row.items_processed ?? 0);
    const itemsTotal = Number(row.items_total ?? 0);
    const message = String(row.message ?? '');
    const progressSuffix = itemsTotal > 0 ? `（${itemsProcessed}/${itemsTotal}）` : '';

    return {
      id: String(row.id),
      runId: String(row.run_id),
      workItemId: String(row.work_item_id),
      sequenceNo: Number(row.sequence_no ?? 0),
      eventType: 'work-item-status',
      level: status === 'failed' ? 'error' : 'info',
      title: `${message}${progressSuffix}`,
      context: `階段：${String(row.stage_name)}`,
      stateLabel,
      stateTone,
      occurredAt: toIsoString(row.started_at) ?? new Date().toISOString(),
      endedAt,
    };
  }
}
