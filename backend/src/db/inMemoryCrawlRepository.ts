import type {
  CrawlArtifact,
  CrawlEvent,
  CrawlManifest,
  CrawlSourceRecord,
  CrawlTaskDetail,
  CrawlTaskSummary,
  CrawlTaskTarget,
  CrawlWorkItem,
  CreateTaskRequest,
  SourceId,
  TaskStatus,
} from '@legaladvisor/shared';
import { SOURCE_CATALOG } from '@legaladvisor/shared';
import type {
  CrawlRepositoryPort,
  InsertArtifactInput,
  InsertEventInput,
  RunSummaryInput,
  SourceHealthPatch,
  UpsertCheckpointInput,
} from '../contracts/runtime.js';
import { createId } from '../utils.js';

type CheckpointRecord = {
  id: string;
  workItemId: string | null;
  checkpointKey: string;
  cursor: Record<string, unknown>;
  updatedAt: string;
};

type InternalTaskState = {
  summary: CrawlTaskSummary;
  workItems: CrawlWorkItem[];
  artifacts: CrawlArtifact[];
  events: CrawlEvent[];
  checkpoints: Map<string, CheckpointRecord>;
  manifestArtifactId: string | null;
  runSummary: RunSummaryInput | null;
};

const finalTaskStatuses = new Set<TaskStatus>(['completed', 'partial_success', 'failed', 'cancelled']);

const workItemPatchMap = {
  status: 'status',
  progress: 'progress',
  current_stage: 'currentStage',
  source_locator: 'sourceLocator',
  cursor: 'cursor',
  last_message: 'lastMessage',
  retry_count: 'retryCount',
  warning_count: 'warningCount',
  error_count: 'errorCount',
  items_processed: 'itemsProcessed',
  items_total: 'itemsTotal',
  started_at: 'startedAt',
  finished_at: 'finishedAt',
} as const;

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCrawlRepository implements CrawlRepositoryPort {
  private readonly sources = new Map<SourceId, CrawlSourceRecord>();
  private readonly tasks = new Map<string, InternalTaskState>();
  private readonly workItemToTask = new Map<string, string>();
  private readonly artifacts = new Map<string, CrawlArtifact>();

  async ensureSourceCatalog() {
    for (const source of SOURCE_CATALOG) {
      const existing = this.sources.get(source.id);
      this.sources.set(source.id, {
        id: source.id,
        name: source.name,
        shortName: source.shortName,
        sourceType: source.sourceType,
        implementationMode: source.implementationMode,
        baseUrl: source.baseUrl,
        description: source.description,
        notes: source.notes,
        healthStatus: existing?.healthStatus ?? 'unknown',
        rateLimitStatus: existing?.rateLimitStatus ?? 'unknown',
        todayRequestCount: existing?.todayRequestCount ?? 0,
        recommendedConcurrency: existing?.recommendedConcurrency ?? 1,
        lastCheckedAt: existing?.lastCheckedAt ?? null,
        lastErrorMessage: existing?.lastErrorMessage ?? null,
        capabilities: clone(source.capabilities),
        taskBuilderFields: clone(source.taskBuilderFields),
      });
    }
  }

  async listSources(): Promise<CrawlSourceRecord[]> {
    return [...this.sources.values()].sort((left, right) => left.name.localeCompare(right.name)).map((source) => clone(source));
  }

  async updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch) {
    const source = this.requireSource(sourceId);
    source.healthStatus = patch.health_status as CrawlSourceRecord['healthStatus'];
    source.rateLimitStatus = patch.rate_limit_status as CrawlSourceRecord['rateLimitStatus'];
    source.lastCheckedAt = patch.last_checked_at;
    source.lastErrorMessage = patch.last_error_message ?? null;
  }

  async incrementSourceRequestCount(sourceId: SourceId, amount = 1) {
    const source = this.requireSource(sourceId);
    source.todayRequestCount += amount;
  }

  async createTask(input: CreateTaskRequest) {
    const source = this.requireSource(input.sourceId);
    const createdAt = nowIso();
    const taskId = createId();
    const targets: CrawlTaskTarget[] = input.targets.map((target) => ({
      id: createId(),
      taskId,
      targetKind: target.kind,
      label: target.label,
      config: clone(target),
      createdAt,
    }));
    const workItems: CrawlWorkItem[] = targets.map((target, index) => ({
      id: createId(),
      taskId,
      taskTargetId: target.id,
      sequenceNo: index + 1,
      label: target.label,
      status: 'pending',
      progress: 0,
      currentStage: 'pending',
      sourceLocator: null,
      cursor: null,
      lastMessage: '等待工作器接手',
      retryCount: 0,
      warningCount: 0,
      errorCount: 0,
      itemsProcessed: 0,
      itemsTotal: 0,
      startedAt: null,
      finishedAt: null,
      updatedAt: createdAt,
      artifacts: [],
      recentEvents: [],
    }));

    const summary: CrawlTaskSummary = {
      id: taskId,
      sourceId: input.sourceId,
      sourceName: source.name,
      status: 'queued',
      summary: '等待工作器接手',
      overallProgress: 0,
      targetCount: targets.length,
      totalWorkItems: workItems.length,
      completedWorkItems: 0,
      failedWorkItems: 0,
      queuedWorkItems: workItems.length,
      runningWorkItems: 0,
      warningCount: 0,
      errorCount: 0,
      startedAt: null,
      finishedAt: null,
      updatedAt: createdAt,
      lastEventAt: null,
      etaSeconds: null,
      targets,
    };

    this.tasks.set(taskId, {
      summary,
      workItems,
      artifacts: [],
      events: [],
      checkpoints: new Map(),
      manifestArtifactId: null,
      runSummary: null,
    });

    for (const workItem of workItems) {
      this.workItemToTask.set(workItem.id, taskId);
    }

    await this.appendEvent({
      id: createId(),
      taskId,
      workItemId: null,
      eventType: 'task-created',
      level: 'info',
      message: '任務已建立，等待排入佇列。',
      details: { sourceId: input.sourceId },
      occurredAt: createdAt,
    });

    return taskId;
  }

  async listTaskSummaries(): Promise<CrawlTaskSummary[]> {
    return [...this.tasks.values()]
      .map((state) => clone(state.summary))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getTaskDetail(taskId: string): Promise<CrawlTaskDetail | null> {
    const state = this.tasks.get(taskId);
    if (!state) {
      return null;
    }

    const summary = clone(state.summary);
    const artifacts = state.artifacts
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((artifact) => clone(artifact));
    const events = state.events.slice(0, 200).map((event) => clone(event));
    const workItems = state.workItems
      .slice()
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((workItem) => ({
        ...clone(workItem),
        artifacts: artifacts.filter((artifact) => artifact.workItemId === workItem.id),
        recentEvents: state.events.filter((event) => event.workItemId === workItem.id).slice(0, 50).map((event) => clone(event)),
      }));
    const checkpoints = [...state.checkpoints.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((checkpoint) => clone(checkpoint));

    return {
      ...summary,
      workItems,
      recentEvents: events,
      artifacts,
      checkpoints,
      manifest: this.buildManifest(summary, workItems, artifacts),
    };
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
    return this.tasks.get(taskId)?.summary.status ?? null;
  }

  async setTaskStatus(taskId: string, status: TaskStatus, summary?: string) {
    const state = this.requireTaskState(taskId);
    const timestamp = nowIso();
    state.summary.status = status;
    if (summary) {
      state.summary.summary = summary;
    }
    if (status === 'running' && !state.summary.startedAt) {
      state.summary.startedAt = timestamp;
    }
    if (finalTaskStatuses.has(status)) {
      state.summary.finishedAt = timestamp;
    } else {
      state.summary.finishedAt = null;
    }
    state.summary.updatedAt = timestamp;
  }

  async updateTaskManifest(taskId: string, manifestArtifactId: string) {
    const state = this.requireTaskState(taskId);
    state.manifestArtifactId = manifestArtifactId;
    state.summary.updatedAt = nowIso();
  }

  async upsertRunSummary(taskId: string, _manifestArtifactId: string | null, summary: RunSummaryInput) {
    const state = this.requireTaskState(taskId);
    state.runSummary = clone(summary);
    state.summary.updatedAt = nowIso();
  }

  async updateWorkItem(workItemId: string, patch: Record<string, unknown>) {
    const { state, workItem } = this.requireWorkItem(workItemId);
    const timestamp = nowIso();

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        continue;
      }
      const targetKey = workItemPatchMap[key as keyof typeof workItemPatchMap];
      if (!targetKey) {
        continue;
      }
      (workItem as unknown as Record<string, unknown>)[targetKey] = value;
    }

    if (workItem.status !== 'pending' && !workItem.startedAt) {
      workItem.startedAt = timestamp;
    }
    if (['done', 'failed', 'skipped'].includes(workItem.status) && !workItem.finishedAt) {
      workItem.finishedAt = timestamp;
    }
    workItem.updatedAt = timestamp;
    state.summary.updatedAt = timestamp;
  }

  async resetFailedWorkItems(taskId: string) {
    const state = this.requireTaskState(taskId);
    const timestamp = nowIso();
    for (const workItem of state.workItems) {
      if (workItem.status !== 'failed') {
        continue;
      }
      workItem.status = 'pending';
      workItem.progress = 0;
      workItem.currentStage = 'pending';
      workItem.lastMessage = '重新排入佇列';
      workItem.finishedAt = null;
      workItem.updatedAt = timestamp;
    }
    state.summary.updatedAt = timestamp;
  }

  async appendEvent(input: InsertEventInput) {
    const state = this.requireTaskState(input.taskId);
    const occurredAt = input.occurredAt ?? nowIso();
    state.events.unshift({
      id: input.id,
      taskId: input.taskId,
      workItemId: input.workItemId,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
      details: clone(input.details),
      occurredAt,
    });
    state.summary.lastEventAt = occurredAt;
    state.summary.updatedAt = occurredAt;
  }

  async insertArtifact(input: InsertArtifactInput) {
    const state = this.requireTaskState(input.taskId);
    const createdAt = input.createdAt ?? nowIso();
    const artifact: CrawlArtifact = {
      ...input,
      metadata: clone(input.metadata),
      createdAt,
    };
    state.artifacts.unshift(artifact);
    this.artifacts.set(artifact.id, artifact);
    state.summary.updatedAt = createdAt;
    return clone(artifact);
  }

  async getArtifact(artifactId: string) {
    const artifact = this.artifacts.get(artifactId);
    return artifact ? clone(artifact) : null;
  }

  async upsertCheckpoint(input: UpsertCheckpointInput) {
    const state = this.requireTaskState(input.taskId);
    const key = this.checkpointKey(input.taskId, input.workItemId, input.checkpointKey);
    const existing = state.checkpoints.get(key);
    const checkpoint: CheckpointRecord = {
      id: existing?.id ?? input.id ?? createId(),
      workItemId: input.workItemId,
      checkpointKey: input.checkpointKey,
      cursor: clone(input.cursor),
      updatedAt: input.updatedAt ?? nowIso(),
    };
    state.checkpoints.set(key, checkpoint);
    state.summary.updatedAt = checkpoint.updatedAt;
  }

  async recomputeTaskStats(taskId: string) {
    const state = this.requireTaskState(taskId);
    const total = state.workItems.length;
    const completed = state.workItems.filter((item) => item.status === 'done').length;
    const failed = state.workItems.filter((item) => item.status === 'failed').length;
    const queued = state.workItems.filter((item) => item.status === 'pending').length;
    const running = state.workItems.filter((item) => !['pending', 'done', 'failed', 'skipped'].includes(item.status)).length;
    const skipped = state.workItems.filter((item) => item.status === 'skipped').length;
    const warningCount = state.workItems.reduce((sum, item) => sum + item.warningCount, 0);
    const errorCount = state.workItems.reduce((sum, item) => sum + item.errorCount, 0);
    const overallProgress = total ? Number((state.workItems.reduce((sum, item) => sum + item.progress, 0) / total).toFixed(2)) : 0;

    let nextStatus = state.summary.status;
    if (!['paused', 'cancelled', 'throttled'].includes(nextStatus)) {
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

    state.summary.status = nextStatus;
    state.summary.overallProgress = overallProgress;
    state.summary.totalWorkItems = total;
    state.summary.completedWorkItems = completed;
    state.summary.failedWorkItems = failed;
    state.summary.queuedWorkItems = queued;
    state.summary.runningWorkItems = running;
    state.summary.warningCount = warningCount;
    state.summary.errorCount = errorCount;
    state.summary.updatedAt = nowIso();
    if (finalTaskStatuses.has(nextStatus)) {
      state.summary.finishedAt = state.summary.finishedAt ?? state.summary.updatedAt;
    } else {
      state.summary.finishedAt = null;
    }
  }

  async getSourceById(sourceId: SourceId) {
    const source = this.sources.get(sourceId);
    return source ? clone(source) : null;
  }

  private requireSource(sourceId: SourceId) {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Unknown source ${sourceId}`);
    }
    return source;
  }

  private requireTaskState(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state) {
      throw new Error(`Task ${taskId} not found`);
    }
    return state;
  }

  private requireWorkItem(workItemId: string) {
    const taskId = this.workItemToTask.get(workItemId);
    if (!taskId) {
      throw new Error(`Work item ${workItemId} not found`);
    }
    const state = this.requireTaskState(taskId);
    const workItem = state.workItems.find((entry) => entry.id === workItemId);
    if (!workItem) {
      throw new Error(`Work item ${workItemId} not found`);
    }
    return { state, workItem };
  }

  private checkpointKey(taskId: string, workItemId: string | null, checkpointKey: string) {
    return `${taskId}:${workItemId ?? 'task'}:${checkpointKey}`;
  }

  private buildManifest(summary: CrawlTaskSummary, workItems: CrawlWorkItem[], artifacts: CrawlArtifact[]): CrawlManifest | null {
    if (!artifacts.length) {
      return null;
    }

    return {
      schemaVersion: '1.0.0',
      taskId: summary.id,
      sourceId: summary.sourceId,
      sourceName: summary.sourceName,
      generatedAt: nowIso(),
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
}