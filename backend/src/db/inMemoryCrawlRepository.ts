import type {
  ArtifactDto as CrawlArtifact,
  RunEventDto as CrawlEvent,
  RunManifestDto as CrawlManifest,
  SourceOverviewDto as CrawlSourceRecord,
  RunDetailDto as CrawlTaskDetail,
  RunSummaryDto as CrawlTaskSummary,
  RunTargetDto as CrawlTaskTarget,
  RunTimelineEntryDto as CrawlTimelineEntry,
  WorkItemDto as CrawlWorkItem,
  SourceId,
  RunStatus,
} from '@legaladvisor/shared';
import type {
  ArtifactContentRecord,
  ArtifactRepository,
  CanonicalArtifactInput,
  CanonicalLawDocumentInput,
  CanonicalLawVersionInput,
  CanonicalLawVersionMatch,
  CreateRunRecordInput,
  EnsureArtifactContentInput,
  EventRepository,
  InsertArtifactInput,
  InsertEventInput,
  InsertStageInput,
  LinkedRunArtifactInput,
  SourceHealthPatch,
  SourceRepository,
  StageRepository,
  RunRepository,
  UpdateStageInput,
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

type RunArtifactLinkRecord = {
  id: string;
  runId: string;
  workItemId: string | null;
  artifactId: string;
  contentStatus: CrawlArtifact['contentStatus'];
  createdAt: string;
};

type InternalRunState = {
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

const finalRunStatuses = new Set<RunStatus>(['completed', 'partial_success', 'failed', 'cancelled']);

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

export class InMemoryCrawlRepository implements SourceRepository, RunRepository, ArtifactRepository, EventRepository, StageRepository {
  private readonly sources = new Map<SourceId, CrawlSourceRecord>();
  private readonly runs = new Map<string, InternalRunState>();
  private readonly workItemToRun = new Map<string, string>();
  private readonly artifactContents = new Map<string, ArtifactContentState>();
  private readonly artifactContentIdsByHash = new Map<string, string>();
  private readonly artifactDefinitions = new Map<string, ArtifactDefinitionRecord>();
  private readonly runArtifactLinks = new Map<string, RunArtifactLinkRecord>();
  private readonly canonicalLawDocuments = new Map<string, CanonicalLawDocumentRecord>();
  private readonly canonicalLawDocumentKeys = new Map<string, string>();
  private readonly canonicalLawVersions = new Map<string, CanonicalLawVersionRecord>();
  private readonly canonicalLawVersionKeys = new Map<string, string>();
  private nextEventSequenceNo = 1;
  private stages: Map<string, { id: string; runId: string; workItemId: string; stageName: string; status: string; message: string; progress: number; itemsProcessed: number; itemsTotal: number; sourceLocator: string | null; sequenceNo: number; startedAt: string; endedAt: string | null }> = new Map();
  private nextStageSequenceNo = 1;

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
        runBuilderFields: clone(source.runBuilderFields),
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

  async createRun(input: CreateRunRecordInput) {
    const source = this.requireSource(input.sourceId);
    const createdAt = nowIso();
    const runId = createId();
    const targets: CrawlTaskTarget[] = input.targets.map((target) => ({
      id: createId(),
      runId: runId,
      targetKind: target.kind,
      label: target.label,
      config: clone(target),
      createdAt,
    }));
    const workItems: CrawlWorkItem[] = targets.map((target, index) => ({
      id: createId(),
      runId: runId,
      runTargetId: target.id,
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
      id: runId,
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

    this.runs.set(runId, {
      summary,
      workItems,
      events: [],
    });

    for (const workItem of workItems) {
      this.workItemToRun.set(workItem.id, runId);
    }

    await this.appendEvent({
      id: createId(),
      runId: runId,
      workItemId: null,
      eventType: 'run-created',
      level: 'info',
      message: '任務已建立，等待排入佇列。',
      details: { sourceId: input.sourceId },
      occurredAt: createdAt,
    });

    return runId;
  }

  async listRunSummaries(): Promise<CrawlTaskSummary[]> {
    return [...this.runs.values()]
      .map((state) => clone(state.summary))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRunSummary(runId: string): Promise<CrawlTaskSummary | null> {
    const state = this.runs.get(runId);
    return state ? clone(state.summary) : null;
  }

  async getRunDetail(runId: string): Promise<CrawlTaskDetail | null> {
    const state = this.runs.get(runId);
    if (!state) {
      return null;
    }

    const summary = clone(state.summary);
    const artifacts = await this.listRunArtifacts(runId);
    const events = await this.listRunEvents(runId, { limit: 500 });
    const workItems = state.workItems
      .slice()
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((workItem) => ({
        ...clone(workItem),
        artifacts: artifacts.filter((artifact) => artifact.workItemId === workItem.id),
        recentEvents: events.filter((event) => event.workItemId === workItem.id).slice(-50).map((event) => clone(event)),
      }));

    return {
      ...summary,
      workItems,
      recentEvents: events,
      artifacts,
      manifest: this.buildManifest(summary, workItems, artifacts),
    };
  }

  async getRunStatus(runId: string): Promise<RunStatus | null> {
    return this.runs.get(runId)?.summary.status ?? null;
  }

  async deleteRun(runId: string) {
    const state = this.requireRunState(runId);

    for (const workItem of state.workItems) {
      this.workItemToRun.delete(workItem.id);
    }

    for (const [linkId, link] of this.runArtifactLinks.entries()) {
      if (link.runId !== runId) {
        continue;
      }

      this.runArtifactLinks.delete(linkId);
      this.cleanupArtifactDefinition(link.artifactId);
    }

    this.runs.delete(runId);
  }

  async setRunStatus(runId: string, status: RunStatus, summary?: string) {
    const state = this.requireRunState(runId);
    const timestamp = nowIso();
    state.summary.status = status;
    if (summary) {
      state.summary.summary = summary;
    }
    if (status === 'running' && !state.summary.startedAt) {
      state.summary.startedAt = timestamp;
    }
    if (finalRunStatuses.has(status)) {
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

  async resetFailedRunItems(runId: string) {
    const state = this.requireRunState(runId);
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

  async recomputeRunStats(runId: string) {
    const state = this.requireRunState(runId);
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
    if (finalRunStatuses.has(nextStatus)) {
      state.summary.finishedAt = state.summary.finishedAt ?? state.summary.updatedAt;
    } else {
      state.summary.finishedAt = null;
    }
  }

  async appendEvent(input: InsertEventInput) {
    const state = this.requireRunState(input.runId);
    const occurredAt = input.occurredAt ?? nowIso();
    const event = {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      sequenceNo: this.nextEventSequenceNo,
      eventType: input.eventType,
      level: input.level,
      message: input.message,
      details: clone(input.details),
      occurredAt,
    } satisfies CrawlEvent;
    this.nextEventSequenceNo += 1;
    state.events.push(event);
    state.summary.lastEventAt = occurredAt;
    state.summary.updatedAt = occurredAt;
    return clone(event);
  }

  async listRunEvents(runId: string, options?: { afterSequenceNo?: number; limit?: number }) {
    const state = this.requireRunState(runId);
    const afterSequenceNo = options?.afterSequenceNo ?? 0;
    const limit = options?.limit ?? 500;
    return state.events
      .filter((event) => event.sequenceNo > afterSequenceNo)
      .slice(-limit)
      .map((event) => clone(event));
  }

  async listRunTimelineEntries(runId: string, _options?: { afterSequenceNo?: number; limit?: number }) {
    return this.listRunStages(runId);
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

    const link: RunArtifactLinkRecord = {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      artifactId: artifactRecord.id,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.runArtifactLinks.set(link.id, link);
    this.requireRunState(input.runId).summary.updatedAt = link.createdAt;
    return this.mapLinkedArtifact(link, artifactRecord);
  }

  async getArtifact(artifactId: string) {
    const link = this.runArtifactLinks.get(artifactId);
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
    const link = this.runArtifactLinks.get(artifactId);
    const artifactDefinition = link ? this.artifactDefinitions.get(link.artifactId) : this.artifactDefinitions.get(artifactId);
    if (!artifactDefinition) {
      return null;
    }
    const content = this.artifactContents.get(artifactDefinition.contentId);
    return content ? Buffer.from(content.buffer) : null;
  }

  async listRunArtifacts(runId: string) {
    return this.listRunArtifactsInternal(runId);
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

  async linkRunArtifact(input: LinkedRunArtifactInput) {
    const canonicalArtifact = this.artifactDefinitions.get(input.canonicalArtifactId);
    if (!canonicalArtifact) {
      throw new Error(`Canonical artifact ${input.canonicalArtifactId} not found.`);
    }

    const existing = [...this.runArtifactLinks.values()].find(
      (link) => link.runId === input.runId && link.workItemId === input.workItemId && link.artifactId === input.canonicalArtifactId,
    );
    if (existing) {
      existing.contentStatus = input.contentStatus;
      return this.mapLinkedArtifact(existing, canonicalArtifact);
    }

    const link: RunArtifactLinkRecord = {
      id: input.id ?? createId(),
      runId: input.runId,
      workItemId: input.workItemId,
      artifactId: input.canonicalArtifactId,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.runArtifactLinks.set(link.id, link);
    this.requireRunState(input.runId).summary.updatedAt = link.createdAt;
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

  private requireRunState(runId: string) {
    const state = this.runs.get(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }
    return state;
  }

  private cleanupArtifactDefinition(artifactId: string) {
    const artifact = this.artifactDefinitions.get(artifactId);
    if (!artifact) {
      return;
    }

    const isStillLinked = [...this.runArtifactLinks.values()].some((link) => link.artifactId === artifactId);
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
    const runId = this.workItemToRun.get(workItemId);
    if (!runId) {
      throw new Error(`Work item ${workItemId} not found`);
    }
    const state = this.requireRunState(runId);
    const workItem = state.workItems.find((entry) => entry.id === workItemId);
    if (!workItem) {
      throw new Error(`Work item ${workItemId} not found`);
    }
    return { state, workItem };
  }

  private listRunArtifactsInternal(runId: string) {
    return [...this.runArtifactLinks.values()]
      .filter((link) => link.runId === runId)
      .map((link) => {
        const artifact = this.artifactDefinitions.get(link.artifactId);
        if (!artifact) {
          throw new Error(`Artifact definition ${link.artifactId} not found.`);
        }
        return this.mapLinkedArtifact(link, artifact);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async insertStage(input: InsertStageInput) {
    const sequenceNo = this.nextStageSequenceNo++;
    this.stages.set(input.id, {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      stageName: input.stageName,
      status: input.status,
      message: input.message ?? '',
      progress: input.progress ?? 0,
      itemsProcessed: input.itemsProcessed ?? 0,
      itemsTotal: input.itemsTotal ?? 0,
      sourceLocator: input.sourceLocator ?? null,
      sequenceNo,
      startedAt: input.startedAt ?? nowIso(),
      endedAt: null,
    });
  }

  async updateStage(stageId: string, patch: UpdateStageInput) {
    const stage = this.stages.get(stageId);
    if (!stage) return;
    if (patch.status !== undefined) stage.status = patch.status;
    if (patch.message !== undefined) stage.message = patch.message;
    if (patch.progress !== undefined) stage.progress = patch.progress;
    if (patch.itemsProcessed !== undefined) stage.itemsProcessed = patch.itemsProcessed;
    if (patch.itemsTotal !== undefined) stage.itemsTotal = patch.itemsTotal;
    if (patch.sourceLocator !== undefined) stage.sourceLocator = patch.sourceLocator;
    if (patch.endedAt !== undefined) stage.endedAt = patch.endedAt;
  }

  async getActiveStage(workItemId: string) {
    let latest: { id: string; stageName: string; sequenceNo: number } | null = null;
    for (const stage of this.stages.values()) {
      if (stage.workItemId === workItemId && stage.endedAt === null) {
        if (!latest || stage.sequenceNo > latest.sequenceNo) {
          latest = { id: stage.id, stageName: stage.stageName, sequenceNo: stage.sequenceNo };
        }
      }
    }
    return latest ? { id: latest.id, stageName: latest.stageName } : null;
  }

  async closeActiveStage(workItemId: string, endedAt: string) {
    for (const stage of this.stages.values()) {
      if (stage.workItemId === workItemId && stage.endedAt === null) {
        stage.status = 'completed';
        stage.endedAt = endedAt;
      }
    }
  }

  async listRunStages(runId: string) {
    return [...this.stages.values()]
      .filter((stage) => stage.runId === runId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((stage) => this.mapStageToTimelineEntry(stage));
  }

  private mapStageToTimelineEntry(stage: { id: string; runId: string; workItemId: string; stageName: string; status: string; message: string; progress: number; itemsProcessed: number; itemsTotal: number; sourceLocator: string | null; sequenceNo: number; startedAt: string; endedAt: string | null }): CrawlTimelineEntry {
    let stateTone: CrawlTimelineEntry['stateTone'] = 'running';
    let stateLabel = '進行中';
    if (stage.status === 'completed') {
      stateTone = 'done';
      stateLabel = '完成';
    } else if (stage.status === 'failed') {
      stateTone = 'failed';
      stateLabel = '失敗';
    }

    const progressSuffix = stage.itemsTotal > 0 ? `（${stage.itemsProcessed}/${stage.itemsTotal}）` : '';

    return {
      id: stage.id,
      runId: stage.runId,
      workItemId: stage.workItemId,
      sequenceNo: stage.sequenceNo,
      eventType: 'work-item-status',
      level: stage.status === 'failed' ? 'error' : 'info',
      title: `${stage.message}${progressSuffix}`,
      context: `階段：${stage.stageName}`,
      stateLabel,
      stateTone,
      occurredAt: stage.startedAt,
      endedAt: stage.endedAt,
    };
  }

  private mapLinkedArtifact(link: RunArtifactLinkRecord, artifact: ArtifactDefinitionRecord): CrawlArtifact {
    return {
      id: link.id,
      runId: link.runId,
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
      runId: `canonical:${artifact.canonicalVersionId ?? 'unknown'}`,
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
      runId: summary.id,
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
