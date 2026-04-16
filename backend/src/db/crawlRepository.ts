import { Pool } from 'pg';
import type {
  ArtifactDto as CrawlArtifact,
  TaskEventDto as CrawlEvent,
  TaskManifestDto as CrawlManifest,
  SourceOverviewDto as CrawlSourceRecord,
  TaskDetailDto as CrawlTaskDetail,
  TaskSummaryDto as CrawlTaskSummary,
  TaskTargetDto as CrawlTaskTarget,
  WorkItemDto as CrawlWorkItem,
  CreateTaskRequestDto as CreateTaskRequest,
  EventLevel,
  EventType,
  SourceId,
  TaskTargetConfig,
  TaskStatus,
  WorkItemStatus,
} from '@legaladvisor/shared';
import type {
  ArtifactRepository,
  CheckpointRepository,
  EventRepository,
  InsertArtifactInput,
  InsertEventInput,
  SourceHealthPatch,
  SourceRepository,
  TaskRepository,
  UpsertCheckpointInput,
} from '../application/ports/repositories.js';
import type { SourceCatalogEntry } from '../domain/sourceCatalog.js';
import { createId } from '../utils.js';

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return fallback;
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

export class CrawlRepository implements SourceRepository, TaskRepository, ArtifactRepository, EventRepository, CheckpointRepository {
  constructor(
    private readonly db: Pool,
    private readonly schema: string,
  ) {}

  private table(name: string) {
    return `${this.schema}.${name}`;
  }

  private async getClient() {
    return this.db.connect();
  }

  async ensureSourceCatalog(catalog: SourceCatalogEntry[]) {
    for (const source of catalog) {
      await this.db.query(
        `
          insert into ${this.table('crawl_sources')} (
            id, name, short_name, source_type, implementation_mode, base_url, description, notes,
            capabilities, task_builder_fields, recommended_concurrency, updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, now()
          )
          on conflict (id) do update set
            name = excluded.name,
            short_name = excluded.short_name,
            source_type = excluded.source_type,
            implementation_mode = excluded.implementation_mode,
            base_url = excluded.base_url,
            description = excluded.description,
            notes = excluded.notes,
            capabilities = excluded.capabilities,
            task_builder_fields = excluded.task_builder_fields,
            recommended_concurrency = excluded.recommended_concurrency,
            updated_at = now()
        `,
        [
          source.id,
          source.name,
          source.shortName,
          source.sourceType,
          source.implementationMode,
          source.baseUrl,
          source.description,
          source.notes,
          JSON.stringify(source.capabilities),
          JSON.stringify(source.taskBuilderFields),
          source.recommendedConcurrency,
        ],
      );
    }
  }

  async listSources(): Promise<CrawlSourceRecord[]> {
    const result = await this.db.query(`select * from ${this.table('crawl_sources')} order by name asc`);
    return result.rows.map((row) => this.mapSource(row));
  }

  async updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch) {
    await this.db.query(
      `
        update ${this.table('crawl_sources')}
        set
          health_status = $2,
          rate_limit_status = $3,
          last_checked_at = $4,
          last_error_message = $5,
          updated_at = now()
        where id = $1
      `,
      [sourceId, patch.healthStatus, patch.rateLimitStatus, patch.lastCheckedAt, patch.lastErrorMessage ?? null],
    );
  }

  async incrementSourceRequestCount(sourceId: SourceId, amount = 1) {
    await this.db.query(
      `update ${this.table('crawl_sources')} set today_request_count = today_request_count + $2, updated_at = now() where id = $1`,
      [sourceId, amount],
    );
  }

  async createTask(input: CreateTaskRequest) {
    const client = await this.getClient();
    const taskId = createId();
    try {
      await client.query('begin');
      const sourceResult = await client.query(`select * from ${this.table('crawl_sources')} where id = $1 limit 1`, [input.sourceId]);
      if (!sourceResult.rowCount) {
        throw new Error(`Unknown source ${input.sourceId}`);
      }

      await client.query(
        `
          insert into ${this.table('crawl_tasks')} (
            id, source_id, status, summary, target_count, total_work_items, queued_work_items, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, now(), now())
        `,
        [taskId, input.sourceId, 'queued', '等待工作器接手', input.targets.length, input.targets.length, input.targets.length],
      );

      for (const [index, target] of input.targets.entries()) {
        const targetId = createId();
        const workItemId = createId();
        await client.query(
          `
            insert into ${this.table('crawl_task_targets')} (
              id, task_id, target_kind, label, config, order_index, created_at
            ) values ($1, $2, $3, $4, $5::jsonb, $6, now())
          `,
          [targetId, taskId, target.kind, target.label, JSON.stringify(target), index],
        );

        await client.query(
          `
            insert into ${this.table('crawl_work_items')} (
              id, task_id, task_target_id, sequence_no, label, status, progress, current_stage, last_message, created_at, updated_at
            ) values ($1, $2, $3, $4, $5, $6, 0, 'pending', '等待工作器接手', now(), now())
          `,
          [workItemId, taskId, targetId, index + 1, target.label, 'pending'],
        );
      }

      await client.query(
        `
          insert into ${this.table('crawl_events')} (
            id, task_id, work_item_id, event_type, level, message, details, occurred_at
          ) values ($1, $2, null, $3, $4, $5, $6::jsonb, now())
        `,
        [createId(), taskId, 'task-created', 'info', '任務已建立，等待排入佇列。', JSON.stringify({ sourceId: input.sourceId })],
      );

      await client.query('commit');
      return taskId;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listTaskSummaries(): Promise<CrawlTaskSummary[]> {
    const result = await this.db.query(`
      select
        t.*,
        s.name as source_name,
        coalesce(
          json_agg(
            json_build_object(
              'id', tt.id,
              'taskId', tt.task_id,
              'targetKind', tt.target_kind,
              'label', tt.label,
              'config', tt.config,
              'createdAt', tt.created_at
            )
            order by tt.order_index asc
          ) filter (where tt.id is not null),
          '[]'::json
        ) as targets
      from ${this.table('crawl_tasks')} t
      join ${this.table('crawl_sources')} s on s.id = t.source_id
      left join ${this.table('crawl_task_targets')} tt on tt.task_id = t.id
      group by t.id, s.name
      order by t.updated_at desc
    `);

    return result.rows.map((row) => this.mapTaskSummary(row));
  }

  async getTaskDetail(taskId: string): Promise<CrawlTaskDetail | null> {
    const taskResult = await this.db.query(
      `
        select
          t.*,
          s.name as source_name,
          coalesce(
            json_agg(
              json_build_object(
                'id', tt.id,
                'taskId', tt.task_id,
                'targetKind', tt.target_kind,
                'label', tt.label,
                'config', tt.config,
                'createdAt', tt.created_at
              )
              order by tt.order_index asc
            ) filter (where tt.id is not null),
            '[]'::json
          ) as targets
        from ${this.table('crawl_tasks')} t
        join ${this.table('crawl_sources')} s on s.id = t.source_id
        left join ${this.table('crawl_task_targets')} tt on tt.task_id = t.id
        where t.id = $1
        group by t.id, s.name
      `,
      [taskId],
    );

    if (!taskResult.rowCount) {
      return null;
    }

    const summary = this.mapTaskSummary(taskResult.rows[0]);
    const [workItemsResult, artifactsResult, eventsResult, checkpointsResult] = await Promise.all([
      this.db.query(`select * from ${this.table('crawl_work_items')} where task_id = $1 order by sequence_no asc`, [taskId]),
      this.db.query(`select * from ${this.table('crawl_artifacts')} where task_id = $1 order by created_at desc`, [taskId]),
      this.db.query(`select * from ${this.table('crawl_events')} where task_id = $1 order by occurred_at desc limit 200`, [taskId]),
      this.db.query(`select * from ${this.table('crawl_checkpoints')} where task_id = $1 order by updated_at desc`, [taskId]),
    ]);

    const artifacts = artifactsResult.rows.map((row) => this.mapArtifact(row));
    const events = eventsResult.rows.map((row) => this.mapEvent(row));
    const workItems = workItemsResult.rows.map((row) => this.mapWorkItem(row, artifacts, events));
    const manifest = await this.buildManifest(summary, workItems, artifacts);

    return {
      ...summary,
      workItems,
      recentEvents: events,
      artifacts,
      checkpoints: checkpointsResult.rows.map((row) => ({
        id: row.id,
        workItemId: row.work_item_id,
        checkpointKey: row.checkpoint_key,
        cursor: parseJson<Record<string, unknown>>(row.cursor, {}),
        updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
      })),
      manifest,
    };
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
    const result = await this.db.query(`select status from ${this.table('crawl_tasks')} where id = $1 limit 1`, [taskId]);
    return (result.rows[0]?.status as TaskStatus | undefined) ?? null;
  }

  async setTaskStatus(taskId: string, status: TaskStatus, summary?: string) {
    await this.db.query(
      `
        update ${this.table('crawl_tasks')}
        set status = $2, summary = coalesce($3, summary), updated_at = now(),
            started_at = case when $2 = 'running' and started_at is null then now() else started_at end,
            finished_at = case when $2 in ('completed', 'partial_success', 'failed', 'cancelled') then now() else finished_at end
        where id = $1
      `,
      [taskId, status, summary ?? null],
    );
  }

  async updateTaskManifest(taskId: string, manifestArtifactId: string) {
    await this.db.query(
      `update ${this.table('crawl_tasks')} set manifest_artifact_id = $2, updated_at = now() where id = $1`,
      [taskId, manifestArtifactId],
    );
  }

  async upsertRunSummary(taskId: string, manifestArtifactId: string | null, summary: { successCount: number; failedCount: number; skippedCount: number; warningCount: number; metadata: Record<string, unknown>; }) {
    await this.db.query(
      `
        insert into ${this.table('crawl_run_summaries')} (
          id, task_id, manifest_artifact_id, success_count, failed_count, skipped_count, warning_count, generated_at, metadata
        ) values ($1, $2, $3, $4, $5, $6, $7, now(), $8::jsonb)
        on conflict (task_id) do update set
          manifest_artifact_id = excluded.manifest_artifact_id,
          success_count = excluded.success_count,
          failed_count = excluded.failed_count,
          skipped_count = excluded.skipped_count,
          warning_count = excluded.warning_count,
          generated_at = now(),
          metadata = excluded.metadata
      `,
      [createId(), taskId, manifestArtifactId, summary.successCount, summary.failedCount, summary.skippedCount, summary.warningCount, JSON.stringify(summary.metadata)],
    );
  }

  async listPendingWorkItems(taskId: string) {
    const result = await this.db.query(
      `select * from ${this.table('crawl_work_items')} where task_id = $1 and status in ('pending', 'failed') order by sequence_no asc`,
      [taskId],
    );
    return result.rows;
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

  async resetFailedWorkItems(taskId: string) {
    await this.db.query(
      `
        update ${this.table('crawl_work_items')}
        set status = 'pending', progress = 0, current_stage = 'pending', last_message = '重新排入佇列', updated_at = now()
        where task_id = $1 and status = 'failed'
      `,
      [taskId],
    );
  }

  async appendEvent(input: InsertEventInput) {
    await this.db.query(
      `
        insert into ${this.table('crawl_events')} (
          id, task_id, work_item_id, event_type, level, message, details, occurred_at
        ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [
        input.id,
        input.taskId,
        input.workItemId,
        input.eventType,
        input.level,
        input.message,
        JSON.stringify(input.details),
        input.occurredAt ?? new Date().toISOString(),
      ],
    );
    await this.db.query(
      `update ${this.table('crawl_tasks')} set last_event_at = now(), updated_at = now() where id = $1`,
      [input.taskId],
    );
  }

  async insertArtifact(input: InsertArtifactInput) {
    const createdAt = input.createdAt ?? new Date().toISOString();
    await this.db.query(
      `
        insert into ${this.table('crawl_artifacts')} (
          id, task_id, work_item_id, artifact_kind, file_name, storage_path, content_type, size_bytes, hash_sha256, schema_version, metadata, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      `,
      [
        input.id,
        input.taskId,
        input.workItemId,
        input.artifactKind,
        input.fileName,
        input.storagePath,
        input.contentType,
        input.sizeBytes,
        input.hashSha256,
        input.schemaVersion,
        JSON.stringify(input.metadata),
        createdAt,
      ],
    );

    return {
      ...input,
      createdAt,
    } satisfies CrawlArtifact;
  }

  async getArtifact(artifactId: string) {
    const result = await this.db.query(`select * from ${this.table('crawl_artifacts')} where id = $1 limit 1`, [artifactId]);
    return result.rowCount ? this.mapArtifact(result.rows[0]) : null;
  }

  async upsertCheckpoint(input: UpsertCheckpointInput) {
    const checkpointId = input.id ?? createId();
    await this.db.query(
      `
        insert into ${this.table('crawl_checkpoints')} (
          id, task_id, work_item_id, checkpoint_key, cursor, updated_at
        ) values ($1, $2, $3, $4, $5::jsonb, $6)
        on conflict (task_id, work_item_id, checkpoint_key) do update set
          cursor = excluded.cursor,
          updated_at = excluded.updated_at
      `,
      [checkpointId, input.taskId, input.workItemId, input.checkpointKey, JSON.stringify(input.cursor), input.updatedAt ?? new Date().toISOString()],
    );
  }

  async recomputeTaskStats(taskId: string) {
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
        where task_id = $1
      `,
      [taskId],
    );

    const stats = aggregateResult.rows[0];
    const taskStatus = await this.getTaskStatus(taskId);
    let nextStatus = taskStatus;
    if (taskStatus && !['paused', 'cancelled', 'throttled'].includes(taskStatus)) {
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
        update ${this.table('crawl_tasks')}
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
        taskId,
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

  async getSourceById(sourceId: SourceId) {
    const result = await this.db.query(`select * from ${this.table('crawl_sources')} where id = $1 limit 1`, [sourceId]);
    return result.rowCount ? this.mapSource(result.rows[0]) : null;
  }

  async getTargetById(targetId: string) {
    const result = await this.db.query(`select * from ${this.table('crawl_task_targets')} where id = $1 limit 1`, [targetId]);
    if (!result.rowCount) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      targetKind: row.target_kind,
      label: row.label,
      config: parseJson(row.config, {}),
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    } as CrawlTaskTarget;
  }

  private async buildManifest(summary: CrawlTaskSummary, workItems: CrawlWorkItem[], artifacts: CrawlArtifact[]): Promise<CrawlManifest | null> {
    if (!artifacts.length) {
      return null;
    }

    return {
      schemaVersion: '1.0.0',
      taskId: summary.id,
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
        fileName: artifact.fileName,
        storagePath: artifact.storagePath,
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

  private mapSource(row: Record<string, unknown>): CrawlSourceRecord {
    return {
      id: String(row.id) as SourceId,
      name: String(row.name),
      shortName: String(row.short_name),
      sourceType: row.source_type as CrawlSourceRecord['sourceType'],
      implementationMode: row.implementation_mode as CrawlSourceRecord['implementationMode'],
      baseUrl: String(row.base_url),
      description: String(row.description),
      notes: String(row.notes),
      healthStatus: row.health_status as CrawlSourceRecord['healthStatus'],
      rateLimitStatus: row.rate_limit_status as CrawlSourceRecord['rateLimitStatus'],
      todayRequestCount: Number(row.today_request_count ?? 0),
      recommendedConcurrency: Number(row.recommended_concurrency ?? 1),
      lastCheckedAt: toIsoString(row.last_checked_at),
      lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
      capabilities: parseJson<string[]>(row.capabilities, []),
      taskBuilderFields: parseJson(row.task_builder_fields, []),
    };
  }

  private mapTaskSummary(row: Record<string, unknown>): CrawlTaskSummary {
    return {
      id: String(row.id),
      sourceId: String(row.source_id) as SourceId,
      sourceName: String(row.source_name),
      status: row.status as TaskStatus,
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
        taskId: String(target.taskId),
        targetKind: target.targetKind as CrawlTaskTarget['targetKind'],
        label: String(target.label),
        config: parseJson<TaskTargetConfig>(target.config as unknown, {} as TaskTargetConfig),
        createdAt: toIsoString(target.createdAt) ?? new Date().toISOString(),
      })),
    };
  }

  private mapArtifact(row: Record<string, unknown>): CrawlArtifact {
    return {
      id: String(row.id),
      taskId: String(row.task_id),
      workItemId: row.work_item_id ? String(row.work_item_id) : null,
      artifactKind: row.artifact_kind as CrawlArtifact['artifactKind'],
      fileName: String(row.file_name),
      storagePath: String(row.storage_path),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes ?? 0),
      hashSha256: String(row.hash_sha256),
      schemaVersion: String(row.schema_version),
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    };
  }

  private mapEvent(row: Record<string, unknown>): CrawlEvent {
    return {
      id: String(row.id),
      taskId: String(row.task_id),
      workItemId: row.work_item_id ? String(row.work_item_id) : null,
      eventType: row.event_type as EventType,
      level: row.level as EventLevel,
      message: String(row.message),
      details: parseJson<Record<string, unknown>>(row.details, {}),
      occurredAt: toIsoString(row.occurred_at) ?? new Date().toISOString(),
    };
  }

  private mapWorkItem(row: Record<string, unknown>, artifacts: CrawlArtifact[], events: CrawlEvent[]): CrawlWorkItem {
    const workItemId = String(row.id);
    return {
      id: workItemId,
      taskId: String(row.task_id),
      taskTargetId: row.task_target_id ? String(row.task_target_id) : null,
      sequenceNo: Number(row.sequence_no ?? 0),
      label: String(row.label),
      status: row.status as WorkItemStatus,
      progress: Number(row.progress ?? 0),
      currentStage: String(row.current_stage ?? 'pending'),
      sourceLocator: row.source_locator ? String(row.source_locator) : null,
      cursor: row.cursor ? parseJson<Record<string, unknown>>(row.cursor, {}) : null,
      lastMessage: String(row.last_message ?? ''),
      retryCount: Number(row.retry_count ?? 0),
      warningCount: Number(row.warning_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      itemsProcessed: Number(row.items_processed ?? 0),
      itemsTotal: Number(row.items_total ?? 0),
      startedAt: toIsoString(row.started_at),
      finishedAt: toIsoString(row.finished_at),
      updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
      artifacts: artifacts.filter((artifact) => artifact.workItemId === workItemId),
      recentEvents: events.filter((event) => event.workItemId === workItemId).slice(0, 50),
    };
  }
}
