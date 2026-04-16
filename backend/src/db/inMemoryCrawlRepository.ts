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
  SourceId,
  TaskStatus,
} from '@legaladvisor/shared';
import type {
  ArtifactContentRecord,
  ArtifactRepository,
  CanonicalArtifactInput,
  CanonicalLawDocumentInput,
  CanonicalLawVersionInput,
  CanonicalLawVersionMatch,
  EnsureArtifactContentInput,
  EventRepository,
  InsertArtifactInput,
  InsertEventInput,
  LinkedTaskArtifactInput,
  SourceHealthPatch,
  SourceRepository,
  TaskRepository,
} from '../application/ports/repositories.js';
import type { SourceCatalogEntry } from '../domain/sourceCatalog.js';
import { createId } from '../utils.js';

type ArtifactDefinitionRecord = {
  id: string;
  artifactKind: CrawlArtifact['artifactKind'];
  artifactRole: CrawlArtifact['artifactRole'];
  canonicalDocumentId: string | null;
  canonicalVersionId: string | null;
  fileName: string;
  contentId: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type ArtifactContentState = ArtifactContentRecord & {
  buffer: Buffer;
  createdAt: string;
};

type TaskArtifactLinkRecord = {
  id: string;
  taskId: string;
  workItemId: string | null;
  artifactId: string;
  contentStatus: CrawlArtifact['contentStatus'];
  createdAt: string;
};

type InternalTaskState = {
  summary: CrawlTaskSummary;
  workItems: CrawlWorkItem[];
  events: CrawlEvent[];
};

type CanonicalLawDocumentRecord = CanonicalLawDocumentInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type CanonicalLawVersionRecord = CanonicalLawVersionInput & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
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

export class InMemoryCrawlRepository implements SourceRepository, TaskRepository, ArtifactRepository, EventRepository {
  private readonly sources = new Map<SourceId, CrawlSourceRecord>();
  private readonly tasks = new Map<string, InternalTaskState>();
  private readonly workItemToTask = new Map<string, string>();
  private readonly artifactContents = new Map<string, ArtifactContentState>();
  private readonly artifactContentIdsByHash = new Map<string, string>();
  private readonly artifactDefinitions = new Map<string, ArtifactDefinitionRecord>();
  private readonly taskArtifactLinks = new Map<string, TaskArtifactLinkRecord>();
  private readonly canonicalLawDocuments = new Map<string, CanonicalLawDocumentRecord>();
  private readonly canonicalLawDocumentKeys = new Map<string, string>();
  private readonly canonicalLawVersions = new Map<string, CanonicalLawVersionRecord>();
  private readonly canonicalLawVersionKeys = new Map<string, string>();

  async ensureSourceCatalog(catalog: SourceCatalogEntry[]) {
    for (const source of catalog) {
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
        recommendedConcurrency: existing?.recommendedConcurrency ?? source.recommendedConcurrency,
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
    source.healthStatus = patch.healthStatus;
    source.lastCheckedAt = patch.lastCheckedAt;
    source.lastErrorMessage = patch.lastErrorMessage ?? null;
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
      events: [],
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
    const artifacts = this.listTaskArtifacts(taskId);
    const events = state.events.slice(0, 200).map((event) => clone(event));
    const workItems = state.workItems
      .slice()
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((workItem) => ({
        ...clone(workItem),
        artifacts: artifacts.filter((artifact) => artifact.workItemId === workItem.id),
        recentEvents: state.events.filter((event) => event.workItemId === workItem.id).slice(0, 50).map((event) => clone(event)),
      }));

    return {
      ...summary,
      workItems,
      recentEvents: events,
      artifacts,
      manifest: this.buildManifest(summary, workItems, artifacts),
    };
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
    return this.tasks.get(taskId)?.summary.status ?? null;
  }

  async deleteTask(taskId: string) {
    const state = this.requireTaskState(taskId);

    for (const workItem of state.workItems) {
      this.workItemToTask.delete(workItem.id);
    }

    for (const [linkId, link] of this.taskArtifactLinks.entries()) {
      if (link.taskId !== taskId) {
        continue;
      }

      this.taskArtifactLinks.delete(linkId);
      this.cleanupArtifactDefinition(link.artifactId);
    }

    this.tasks.delete(taskId);
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
    if (!['paused', 'cancelled'].includes(nextStatus)) {
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

  async ensureArtifactContent(input: EnsureArtifactContentInput) {
    const existingId = this.artifactContentIdsByHash.get(input.hashSha256);
    if (existingId) {
      const existing = this.artifactContents.get(existingId);
      if (!existing) {
        throw new Error(`Artifact content ${existingId} not found.`);
      }
      return {
        id: existing.id,
        hashSha256: existing.hashSha256,
        contentType: existing.contentType,
        sizeBytes: existing.sizeBytes,
        encoding: existing.encoding,
      } satisfies ArtifactContentRecord;
    }

    const record: ArtifactContentState = {
      id: createId(),
      hashSha256: input.hashSha256,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      encoding: input.encoding,
      buffer: Buffer.from(input.buffer),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.artifactContents.set(record.id, record);
    this.artifactContentIdsByHash.set(record.hashSha256, record.id);
    return {
      id: record.id,
      hashSha256: record.hashSha256,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      encoding: record.encoding,
    } satisfies ArtifactContentRecord;
  }

  async insertArtifact(input: InsertArtifactInput) {
    const artifactRecord: ArtifactDefinitionRecord = {
      id: createId(),
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      canonicalDocumentId: input.canonicalDocumentId,
      canonicalVersionId: input.canonicalVersionId,
      fileName: input.fileName,
      contentId: input.contentId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      hashSha256: input.hashSha256,
      schemaVersion: input.schemaVersion,
      metadata: clone({
        ...input.metadata,
        artifactRole: input.artifactRole,
        contentStatus: input.contentStatus,
        canonicalDocumentId: input.canonicalDocumentId,
        canonicalVersionId: input.canonicalVersionId,
      }),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.artifactDefinitions.set(artifactRecord.id, artifactRecord);

    const link: TaskArtifactLinkRecord = {
      id: input.id,
      taskId: input.taskId,
      workItemId: input.workItemId,
      artifactId: artifactRecord.id,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.taskArtifactLinks.set(link.id, link);
    this.requireTaskState(input.taskId).summary.updatedAt = link.createdAt;
    return this.mapLinkedArtifact(link, artifactRecord);
  }

  async getArtifact(artifactId: string) {
    const link = this.taskArtifactLinks.get(artifactId);
    if (link) {
      const artifact = this.artifactDefinitions.get(link.artifactId);
      if (!artifact) {
        return null;
      }
      return this.mapLinkedArtifact(link, artifact);
    }

    const canonicalArtifact = this.artifactDefinitions.get(artifactId);
    if (!canonicalArtifact) {
      return null;
    }

    return this.mapCanonicalArtifact(canonicalArtifact);
  }

  async getArtifactContent(artifactId: string) {
    const link = this.taskArtifactLinks.get(artifactId);
    const artifactDefinition = link ? this.artifactDefinitions.get(link.artifactId) : this.artifactDefinitions.get(artifactId);
    if (!artifactDefinition) {
      return null;
    }
    const content = this.artifactContents.get(artifactDefinition.contentId);
    return content ? Buffer.from(content.buffer) : null;
  }

  async ensureCanonicalLawDocument(input: CanonicalLawDocumentInput) {
    const key = `${input.sourceId}:${input.normalizedLawName}`;
    const existingId = this.canonicalLawDocumentKeys.get(key);
    if (existingId) {
      const existing = this.canonicalLawDocuments.get(existingId);
      if (!existing) {
        throw new Error(`Canonical law document ${existingId} not found.`);
      }
      existing.lawName = input.lawName;
      existing.englishName = input.englishName;
      existing.lawLevel = input.lawLevel;
      existing.category = input.category;
      existing.lawUrl = input.lawUrl;
      existing.updatedAt = nowIso();
      return existing.id;
    }

    const record: CanonicalLawDocumentRecord = {
      ...clone(input),
      id: createId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.canonicalLawDocuments.set(record.id, record);
    this.canonicalLawDocumentKeys.set(key, record.id);
    return record.id;
  }

  async findCanonicalLawVersion(sourceId: SourceId, normalizedLawName: string, versionFingerprint: string): Promise<CanonicalLawVersionMatch | null> {
    const lawDocumentId = this.canonicalLawDocumentKeys.get(`${sourceId}:${normalizedLawName}`);
    if (!lawDocumentId) {
      return null;
    }

    const versionId = this.canonicalLawVersionKeys.get(`${lawDocumentId}:${versionFingerprint}`);
    if (!versionId) {
      return null;
    }

    const artifacts = [...this.artifactDefinitions.values()]
      .filter((artifact) => artifact.canonicalVersionId === versionId)
      .map((artifact) => this.mapCanonicalArtifact(artifact));

    return {
      lawDocumentId,
      lawVersionId: versionId,
      versionFingerprint,
      artifacts,
    };
  }

  async createCanonicalLawVersion(input: CanonicalLawVersionInput) {
    const key = `${input.lawDocumentId}:${input.versionFingerprint}`;
    const existingId = this.canonicalLawVersionKeys.get(key);
    if (existingId) {
      const existing = this.canonicalLawVersions.get(existingId);
      if (!existing) {
        throw new Error(`Canonical law version ${existingId} not found.`);
      }
      existing.lastSeenAt = nowIso();
      return existing.id;
    }

    const record: CanonicalLawVersionRecord = {
      ...clone(input),
      id: createId(),
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    this.canonicalLawVersions.set(record.id, record);
    this.canonicalLawVersionKeys.set(key, record.id);
    return record.id;
  }

  async insertCanonicalArtifact(input: CanonicalArtifactInput) {
    const artifact: ArtifactDefinitionRecord = {
      id: input.id,
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      canonicalDocumentId: input.lawDocumentId,
      canonicalVersionId: input.lawVersionId,
      fileName: input.fileName,
      contentId: input.contentId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      hashSha256: input.hashSha256,
      schemaVersion: input.schemaVersion,
      metadata: clone({
        ...input.metadata,
        artifactRole: input.artifactRole,
        contentStatus: 'new',
        canonicalDocumentId: input.lawDocumentId,
        canonicalVersionId: input.lawVersionId,
      }),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.artifactDefinitions.set(artifact.id, artifact);
    return this.mapCanonicalArtifact(artifact);
  }

  async linkTaskArtifact(input: LinkedTaskArtifactInput) {
    const canonicalArtifact = this.artifactDefinitions.get(input.canonicalArtifactId);
    if (!canonicalArtifact) {
      throw new Error(`Canonical artifact ${input.canonicalArtifactId} not found.`);
    }

    const existing = [...this.taskArtifactLinks.values()].find(
      (link) => link.taskId === input.taskId && link.workItemId === input.workItemId && link.artifactId === input.canonicalArtifactId,
    );
    if (existing) {
      existing.contentStatus = input.contentStatus;
      return this.mapLinkedArtifact(existing, canonicalArtifact);
    }

    const link: TaskArtifactLinkRecord = {
      id: input.id ?? createId(),
      taskId: input.taskId,
      workItemId: input.workItemId,
      artifactId: input.canonicalArtifactId,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.taskArtifactLinks.set(link.id, link);
    this.requireTaskState(input.taskId).summary.updatedAt = link.createdAt;
    return this.mapLinkedArtifact(link, canonicalArtifact);
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

  private cleanupArtifactDefinition(artifactId: string) {
    const artifact = this.artifactDefinitions.get(artifactId);
    if (!artifact) {
      return;
    }

    const isStillLinked = [...this.taskArtifactLinks.values()].some((link) => link.artifactId === artifactId);
    if (isStillLinked || artifact.canonicalVersionId || artifact.canonicalDocumentId) {
      return;
    }

    this.artifactDefinitions.delete(artifactId);
    this.cleanupArtifactContent(artifact.contentId);
  }

  private cleanupArtifactContent(contentId: string) {
    const isStillReferenced = [...this.artifactDefinitions.values()].some((artifact) => artifact.contentId === contentId);
    if (isStillReferenced) {
      return;
    }

    const content = this.artifactContents.get(contentId);
    if (!content) {
      return;
    }

    this.artifactContents.delete(contentId);
    this.artifactContentIdsByHash.delete(content.hashSha256);
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

  private listTaskArtifacts(taskId: string) {
    return [...this.taskArtifactLinks.values()]
      .filter((link) => link.taskId === taskId)
      .map((link) => {
        const artifact = this.artifactDefinitions.get(link.artifactId);
        if (!artifact) {
          throw new Error(`Artifact definition ${link.artifactId} not found.`);
        }
        return this.mapLinkedArtifact(link, artifact);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private mapLinkedArtifact(link: TaskArtifactLinkRecord, artifact: ArtifactDefinitionRecord): CrawlArtifact {
    return {
      id: link.id,
      taskId: link.taskId,
      workItemId: link.workItemId,
      artifactKind: artifact.artifactKind,
      artifactRole: artifact.artifactRole,
      contentStatus: link.contentStatus,
      canonicalDocumentId: artifact.canonicalDocumentId,
      canonicalVersionId: artifact.canonicalVersionId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      hashSha256: artifact.hashSha256,
      schemaVersion: artifact.schemaVersion,
      metadata: clone({
        ...artifact.metadata,
        artifactRole: artifact.artifactRole,
        contentStatus: link.contentStatus,
        canonicalDocumentId: artifact.canonicalDocumentId,
        canonicalVersionId: artifact.canonicalVersionId,
      }),
      createdAt: link.createdAt,
    };
  }

  private mapCanonicalArtifact(artifact: ArtifactDefinitionRecord): CrawlArtifact {
    return {
      id: artifact.id,
      taskId: `canonical:${artifact.canonicalVersionId ?? 'unknown'}`,
      workItemId: null,
      artifactKind: artifact.artifactKind,
      artifactRole: artifact.artifactRole,
      contentStatus: 'new',
      canonicalDocumentId: artifact.canonicalDocumentId,
      canonicalVersionId: artifact.canonicalVersionId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      hashSha256: artifact.hashSha256,
      schemaVersion: artifact.schemaVersion,
      metadata: clone({
        ...artifact.metadata,
        artifactRole: artifact.artifactRole,
        contentStatus: 'new',
        canonicalDocumentId: artifact.canonicalDocumentId,
        canonicalVersionId: artifact.canonicalVersionId,
      }),
      createdAt: artifact.createdAt,
    };
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
}
