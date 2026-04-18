import type {
  ArtifactDto as CrawlArtifact,
  RunEventDto as CrawlEvent,
  RunManifestDto as CrawlManifest,
  SourceOverviewDto as CrawlSourceRecord,
  RunDetailDto as CrawlTaskDetail,
  RunSummaryDto as CrawlTaskSummary,
  RunTargetDto as CrawlTaskTarget,
  WorkItemDto as CrawlWorkItem,
  SourceId,
  RunTargetConfig,
  RunStatus,
} from '@legaladvisor/shared';
import type {
  ArtifactRepository,
  CreateRunRecordInput,
  EventRepository,
  RunRepository,
  StageRepository,
  WorkItemPatch,
} from '../../application/ports/repositories.js';
import { createId } from '../../utils.js';
import { PgBase, parseJson, toIsoString } from './helpers.js';

export class PgRunRepository extends PgBase implements RunRepository {
  constructor(
    db: import('pg').Pool,
    schema: string,
    private readonly artifactRepo: ArtifactRepository,
    private readonly eventRepo: EventRepository,
    private readonly stageRepo: StageRepository,
  ) {
    super(db, schema);
  }

  async createRun(input: CreateRunRecordInput) {
    const client = await this.getClient();
    const runId = createId();
    try {
      await client.query('begin');
      const sourceResult = await client.query(`select * from ${this.table('crawl_sources')} where id = $1 limit 1`, [input.sourceId]);
      if (!sourceResult.rowCount) {
        throw new Error(`Unknown source ${input.sourceId}`);
      }

      await client.query(
        `
          insert into ${this.table('crawl_runs')} (
            id, source_id, status, summary, target_count, total_work_items, queued_work_items, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, now(), now())
        `,
        [runId, input.sourceId, 'queued', '等待工作器接手', input.targets.length, input.targets.length, input.targets.length],
      );

      for (const [index, target] of input.targets.entries()) {
        const targetId = createId();
        const workItemId = createId();
        await client.query(
          `
            insert into ${this.table('crawl_run_targets')} (
              id, run_id, target_kind, label, config, order_index, created_at
            ) values ($1, $2, $3, $4, $5::jsonb, $6, now())
          `,
          [targetId, runId, target.kind, target.label, JSON.stringify(target), index],
        );

        await client.query(
          `
            insert into ${this.table('crawl_work_items')} (
              id, run_id, run_target_id, sequence_no, label, status, progress, current_stage, last_message, created_at, updated_at
            ) values ($1, $2, $3, $4, $5, $6, 0, 'pending', '等待工作器接手', now(), now())
          `,
          [workItemId, runId, targetId, index + 1, target.label, 'pending'],
        );
      }

      await client.query(
        `
          insert into ${this.table('crawl_events')} (
            id, run_id, work_item_id, event_type, level, message, details, occurred_at
          ) values ($1, $2, null, $3, $4, $5, $6::jsonb, now())
        `,
        [createId(), runId, 'run-created', 'info', '任務已建立，等待排入佇列。', JSON.stringify({ sourceId: input.sourceId })],
      );

      await client.query('commit');
      return runId;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRunSummaries(): Promise<CrawlTaskSummary[]> {
    const result = await this.db.query(`
      select
        t.*,
        s.name as source_name,
        coalesce(
          json_agg(
            json_build_object(
              'id', tt.id,
              'runId', tt.run_id,
              'targetKind', tt.target_kind,
              'label', tt.label,
              'config', tt.config,
              'createdAt', tt.created_at
            )
            order by tt.order_index asc
          ) filter (where tt.id is not null),
          '[]'::json
        ) as targets
      from ${this.table('crawl_runs')} t
      join ${this.table('crawl_sources')} s on s.id = t.source_id
      left join ${this.table('crawl_run_targets')} tt on tt.run_id = t.id
      group by t.id, s.name
      order by t.updated_at desc
    `);

    return result.rows.map((row) => this.mapRunSummary(row));
  }

  async getRunSummary(runId: string): Promise<CrawlTaskSummary | null> {
    const runResult = await this.db.query(
      `
        select
          t.*,
          s.name as source_name,
          coalesce(
            json_agg(
              json_build_object(
                'id', tt.id,
                'runId', tt.run_id,
                'targetKind', tt.target_kind,
                'label', tt.label,
                'config', tt.config,
                'createdAt', tt.created_at
              )
              order by tt.order_index asc
            ) filter (where tt.id is not null),
            '[]'::json
          ) as targets
        from ${this.table('crawl_runs')} t
        join ${this.table('crawl_sources')} s on s.id = t.source_id
        left join ${this.table('crawl_run_targets')} tt on tt.run_id = t.id
        where t.id = $1
        group by t.id, s.name
      `,
      [runId],
    );

    if (!runResult.rowCount) {
      return null;
    }

    return this.mapRunSummary(runResult.rows[0]);
  }

  async getRunDetail(runId: string): Promise<CrawlTaskDetail | null> {
    const summary = await this.getRunSummary(runId);
    if (!summary) {
      return null;
    }

    const [workItemsResult, artifacts, events] = await Promise.all([
      this.db.query(`select * from ${this.table('crawl_work_items')} where run_id = $1 order by sequence_no asc`, [runId]),
      this.artifactRepo.listRunArtifacts(runId),
      this.eventRepo.listRunEvents(runId, { limit: 500 }),
    ]);

    const workItems = workItemsResult.rows.map((row) => this.mapWorkItem(row, artifacts, events));
    const manifest = this.buildManifest(summary, workItems, artifacts);

    return {
      ...summary,
      workItems,
      recentEvents: events,
      artifacts,
      manifest,
    };
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    const result = await this.db.query(`select status from ${this.table('crawl_runs')} where id = $1 limit 1`, [runId]);
    return (result.rows[0]?.status as RunStatus | undefined) ?? null;
  }

  async deleteRun(runId: string) {
    const client = await this.getClient();
    try {
      await client.query('begin');

      const linkedArtifacts = await client.query(
        `
          select distinct artifact.id, artifact.content_id, artifact.canonical_document_id, artifact.canonical_version_id
          from ${this.table('crawl_run_artifact_links')} link
          join ${this.table('artifacts')} artifact on artifact.id = link.artifact_id
          where link.run_id = $1
        `,
        [runId],
      );

      await client.query(`delete from ${this.table('crawl_runs')} where id = $1`, [runId]);

      const removableArtifactIds = linkedArtifacts.rows
        .filter((row) => !row.canonical_document_id && !row.canonical_version_id)
        .map((row) => String(row.id));

      if (removableArtifactIds.length) {
        await client.query(
          `
            delete from ${this.table('artifacts')} artifact
            where artifact.id = any($1::text[])
              and not exists (
                select 1 from ${this.table('crawl_run_artifact_links')} link where link.artifact_id = artifact.id
              )
          `,
          [removableArtifactIds],
        );
      }

      const removableContentIds = [...new Set(linkedArtifacts.rows.map((row) => String(row.content_id)).filter(Boolean))];
      if (removableContentIds.length) {
        await client.query(
          `
            delete from ${this.table('artifact_contents')} content
            where content.id = any($1::text[])
              and not exists (
                select 1 from ${this.table('artifacts')} artifact where artifact.content_id = content.id
              )
          `,
          [removableContentIds],
        );
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async setRunStatus(runId: string, status: RunStatus, summary?: string) {
    await this.db.query(
      `
        update ${this.table('crawl_runs')}
        set status = $2, summary = coalesce($3, summary), updated_at = now(),
            started_at = case when $2 = 'running' and started_at is null then now() else started_at end,
            finished_at = case when $2 in ('completed', 'partial_success', 'failed', 'cancelled') then now() else finished_at end
        where id = $1
      `,
      [runId, status, summary ?? null],
    );
  }

  async updateWorkItem(workItemId: string, patch: Record<string, unknown>) {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (!entries.length) {
      return;
    }

    const assignments = entries.map(([key], index) => `${key} = $${index + 1}`);
    await this.db.query(
      `update ${this.table('crawl_work_items')} set ${assignments.join(', ')}, updated_at = now() where id = $${entries.length + 1}`,
      [...entries.map(([, value]) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : value)), workItemId],
    );
  }

  async resetFailedRunItems(runId: string) {
    await this.db.query(
      `
        update ${this.table('crawl_work_items')}
        set status = 'pending', progress = 0, current_stage = 'pending', last_message = '重新排入佇列', updated_at = now()
        where run_id = $1 and status = 'failed'
      `,
      [runId],
    );
  }

  async recomputeRunStats(runId: string) {
    const aggregateResult = await this.db.query(
      `
        select
          count(*)::int as total_work_items,
          count(*) filter (where status = 'done')::int as completed_work_items,
          count(*) filter (where status = 'failed')::int as failed_work_items,
          count(*) filter (where status = 'pending')::int as queued_work_items,
          count(*) filter (where status not in ('pending', 'done', 'failed', 'skipped'))::int as running_work_items,
          count(*) filter (where status = 'skipped')::int as skipped_work_items,
          coalesce(avg(progress), 0)::numeric(5,2) as overall_progress,
          coalesce(sum(warning_count), 0)::int as warning_count,
          coalesce(sum(error_count), 0)::int as error_count
        from ${this.table('crawl_work_items')}
        where run_id = $1
      `,
      [runId],
    );

    const stats = aggregateResult.rows[0];
    const runStatus = await this.getRunStatus(runId);
    let nextStatus = runStatus;
    if (runStatus && !['paused', 'cancelled'].includes(runStatus)) {
      const total = Number(stats.total_work_items ?? 0);
      const completed = Number(stats.completed_work_items ?? 0);
      const failed = Number(stats.failed_work_items ?? 0);
      const skipped = Number(stats.skipped_work_items ?? 0);
      const running = Number(stats.running_work_items ?? 0);
      const queued = Number(stats.queued_work_items ?? 0);

      if (total > 0 && completed + failed + skipped === total) {
        if (failed === 0) {
          nextStatus = 'completed';
        } else if (completed > 0 || skipped > 0) {
          nextStatus = 'partial_success';
        } else {
          nextStatus = 'failed';
        }
      } else if (running > 0) {
        nextStatus = 'running';
      } else if (queued > 0) {
        nextStatus = 'queued';
      }
    }

    await this.db.query(
      `
        update ${this.table('crawl_runs')}
        set
          status = $2,
          overall_progress = $3,
          total_work_items = $4,
          completed_work_items = $5,
          failed_work_items = $6,
          queued_work_items = $7,
          running_work_items = $8,
          warning_count = $9,
          error_count = $10,
          updated_at = now(),
          finished_at = case when $2 in ('completed', 'partial_success', 'failed') then now() else finished_at end
        where id = $1
      `,
      [
        runId,
        nextStatus,
        Number(stats.overall_progress ?? 0),
        Number(stats.total_work_items ?? 0),
        Number(stats.completed_work_items ?? 0),
        Number(stats.failed_work_items ?? 0),
        Number(stats.queued_work_items ?? 0),
        Number(stats.running_work_items ?? 0),
        Number(stats.warning_count ?? 0),
        Number(stats.error_count ?? 0),
      ],
    );
  }

  private buildManifest(summary: CrawlTaskSummary, workItems: CrawlWorkItem[], artifacts: CrawlArtifact[]): CrawlManifest | null {
    if (!artifacts.length) {
      return null;
    }

    return {
      schemaVersion: '1.0.0',
      runId: summary.id,
      sourceId: summary.sourceId,
      sourceName: summary.sourceName,
      generatedAt: new Date().toISOString(),
      targets: summary.targets.map((target) => ({
        id: target.id,
        label: target.label,
        targetKind: target.targetKind,
      })),
      counts: {
        artifacts: artifacts.length,
        success: summary.completedWorkItems,
        failed: summary.failedWorkItems,
        skipped: workItems.filter((item) => item.status === 'skipped').length,
        warnings: summary.warningCount,
      },
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.artifactKind,
        role: artifact.artifactRole,
        contentStatus: artifact.contentStatus,
        canonicalDocumentId: artifact.canonicalDocumentId,
        canonicalVersionId: artifact.canonicalVersionId,
        fileName: artifact.fileName,
        hashSha256: artifact.hashSha256,
      })),
      failures: workItems
        .filter((item) => item.status === 'failed')
        .map((item) => ({
          workItemId: item.id,
          label: item.label,
          message: item.lastMessage,
        })),
    };
  }

  private mapRunSummary(row: Record<string, unknown>): CrawlTaskSummary {
    return {
      id: String(row.id),
      sourceId: String(row.source_id) as SourceId,
      sourceName: String(row.source_name),
      status: row.status as RunStatus,
      summary: String(row.summary ?? ''),
      overallProgress: Number(row.overall_progress ?? 0),
      targetCount: Number(row.target_count ?? 0),
      totalWorkItems: Number(row.total_work_items ?? 0),
      completedWorkItems: Number(row.completed_work_items ?? 0),
      failedWorkItems: Number(row.failed_work_items ?? 0),
      queuedWorkItems: Number(row.queued_work_items ?? 0),
      runningWorkItems: Number(row.running_work_items ?? 0),
      warningCount: Number(row.warning_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      startedAt: toIsoString(row.started_at),
      finishedAt: toIsoString(row.finished_at),
      updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
      lastEventAt: toIsoString(row.last_event_at),
      etaSeconds: row.eta_seconds ? Number(row.eta_seconds) : null,
      targets: parseJson<Array<Record<string, unknown>>>(row.targets, []).map((target) => ({
        id: String(target.id),
        runId: String(target.runId),
        targetKind: target.targetKind as CrawlTaskTarget['targetKind'],
        label: String(target.label),
        config: parseJson<RunTargetConfig>(target.config as unknown, {} as RunTargetConfig),
        createdAt: toIsoString(target.createdAt) ?? new Date().toISOString(),
      })),
    };
  }

  private mapWorkItem(row: Record<string, unknown>, artifacts: CrawlArtifact[], events: CrawlEvent[]): CrawlWorkItem {
    const id = String(row.id);
    return {
      id,
      runId: String(row.run_id),
      runTargetId: String(row.run_target_id),
      sequenceNo: Number(row.sequence_no ?? 0),
      label: String(row.label),
      status: String(row.status) as CrawlWorkItem['status'],
      progress: Number(row.progress ?? 0),
      currentStage: String(row.current_stage ?? 'pending'),
      sourceLocator: row.source_locator ? String(row.source_locator) : null,
      cursor: parseJson<Record<string, unknown> | null>(row.cursor, null),
      lastMessage: String(row.last_message ?? ''),
      retryCount: Number(row.retry_count ?? 0),
      warningCount: Number(row.warning_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      itemsProcessed: Number(row.items_processed ?? 0),
      itemsTotal: Number(row.items_total ?? 0),
      startedAt: toIsoString(row.started_at),
      finishedAt: toIsoString(row.finished_at),
      updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
      artifacts: artifacts.filter((a) => a.workItemId === id),
      recentEvents: events.filter((e) => e.workItemId === id).slice(-50),
    };
  }
}
