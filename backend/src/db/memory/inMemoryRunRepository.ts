import type {
  ArtifactDto as CrawlArtifact,
  RunEventDto as CrawlEvent,
  RunManifestDto as CrawlManifest,
  RunDetailDto as CrawlTaskDetail,
  RunSummaryDto as CrawlTaskSummary,
  RunTargetDto as CrawlTaskTarget,
  WorkItemDto as CrawlWorkItem,
  RunStatus,
} from '@legaladvisor/shared';
import type {
  ArtifactRepository,
  CreateRunRecordInput,
  EventRepository,
  RunRepository,
  StageRepository,
} from '../../application/ports/repositories.js';
import { createId } from '../../utils.js';
import { type InMemoryDataStore, clone, nowIso } from './inMemoryDataStore.js';

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

export class InMemoryRunRepository implements RunRepository {
  constructor(
    private readonly store: InMemoryDataStore,
    private readonly artifactRepo: ArtifactRepository,
    private readonly eventRepo: EventRepository,
    private readonly stageRepo: StageRepository,
  ) {}

  async createRun(input: CreateRunRecordInput) {
    const source = this.store.requireSource(input.sourceId);
    const createdAt = nowIso();
    const runId = createId();
    const targets: CrawlTaskTarget[] = input.targets.map((target) => ({
      id: createId(),
      runId,
      targetKind: target.kind,
      label: target.label,
      config: clone(target),
      createdAt,
    }));
    const workItems: CrawlWorkItem[] = targets.map((target, index) => ({
      id: createId(),
      runId,
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

    this.store.runs.set(runId, { summary, workItems, events: [] });
    for (const workItem of workItems) {
      this.store.workItemToRun.set(workItem.id, runId);
    }

    await this.eventRepo.appendEvent({
      id: createId(),
      runId,
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
    return [...this.store.runs.values()]
      .map((state) => clone(state.summary))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getRunSummary(runId: string): Promise<CrawlTaskSummary | null> {
    const state = this.store.runs.get(runId);
    return state ? clone(state.summary) : null;
  }

  async getRunDetail(runId: string): Promise<CrawlTaskDetail | null> {
    const state = this.store.runs.get(runId);
    if (!state) return null;

    const summary = clone(state.summary);
    const artifacts = await this.artifactRepo.listRunArtifacts(runId);
    const events = await this.eventRepo.listRunEvents(runId, { limit: 500 });
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
    return this.store.runs.get(runId)?.summary.status ?? null;
  }

  async deleteRun(runId: string) {
    const state = this.store.requireRunState(runId);
    for (const workItem of state.workItems) {
      this.store.workItemToRun.delete(workItem.id);
    }
    for (const [linkId, link] of this.store.runArtifactLinks.entries()) {
      if (link.runId !== runId) continue;
      this.store.runArtifactLinks.delete(linkId);
      this.cleanupArtifactDefinition(link.artifactId);
    }
    this.store.runs.delete(runId);
  }

  async setRunStatus(runId: string, status: RunStatus, summary?: string) {
    const state = this.store.requireRunState(runId);
    const timestamp = nowIso();
    state.summary.status = status;
    if (summary) state.summary.summary = summary;
    if (status === 'running' && !state.summary.startedAt) state.summary.startedAt = timestamp;
    if (finalRunStatuses.has(status)) {
      state.summary.finishedAt = timestamp;
    } else {
      state.summary.finishedAt = null;
    }
    state.summary.updatedAt = timestamp;
  }

  async updateWorkItem(workItemId: string, patch: Record<string, unknown>) {
    const { state, workItem } = this.store.requireWorkItem(workItemId);
    const timestamp = nowIso();
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const targetKey = workItemPatchMap[key as keyof typeof workItemPatchMap];
      if (!targetKey) continue;
      (workItem as unknown as Record<string, unknown>)[targetKey] = value;
    }
    if (workItem.status !== 'pending' && !workItem.startedAt) workItem.startedAt = timestamp;
    if (['done', 'failed', 'skipped'].includes(workItem.status) && !workItem.finishedAt) workItem.finishedAt = timestamp;
    workItem.updatedAt = timestamp;
    state.summary.updatedAt = timestamp;
  }

  async resetFailedRunItems(runId: string) {
    const state = this.store.requireRunState(runId);
    const timestamp = nowIso();
    for (const workItem of state.workItems) {
      if (workItem.status !== 'failed') continue;
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
    const state = this.store.requireRunState(runId);
    const total = state.workItems.length;
    const completed = state.workItems.filter((i) => i.status === 'done').length;
    const failed = state.workItems.filter((i) => i.status === 'failed').length;
    const queued = state.workItems.filter((i) => i.status === 'pending').length;
    const running = state.workItems.filter((i) => !['pending', 'done', 'failed', 'skipped'].includes(i.status)).length;
    const skipped = state.workItems.filter((i) => i.status === 'skipped').length;
    const warningCount = state.workItems.reduce((sum, i) => sum + i.warningCount, 0);
    const errorCount = state.workItems.reduce((sum, i) => sum + i.errorCount, 0);
    const overallProgress = total ? Number((state.workItems.reduce((sum, i) => sum + i.progress, 0) / total).toFixed(2)) : 0;

    let nextStatus = state.summary.status;
    if (!['paused', 'cancelled'].includes(nextStatus)) {
      if (total > 0 && completed + failed + skipped === total) {
        if (failed === 0) nextStatus = 'completed';
        else if (completed > 0 || skipped > 0) nextStatus = 'partial_success';
        else nextStatus = 'failed';
      } else if (running > 0) {
        nextStatus = 'running';
      } else if (queued > 0) {
        nextStatus = 'queued';
      }
    }

    Object.assign(state.summary, {
      status: nextStatus,
      overallProgress,
      totalWorkItems: total,
      completedWorkItems: completed,
      failedWorkItems: failed,
      queuedWorkItems: queued,
      runningWorkItems: running,
      warningCount,
      errorCount,
      updatedAt: nowIso(),
    });
    if (finalRunStatuses.has(nextStatus)) {
      state.summary.finishedAt = state.summary.finishedAt ?? state.summary.updatedAt;
    } else {
      state.summary.finishedAt = null;
    }
  }

  private buildManifest(summary: CrawlTaskSummary, workItems: CrawlWorkItem[], artifacts: CrawlArtifact[]): CrawlManifest | null {
    if (!artifacts.length) return null;
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
        skipped: workItems.filter((i) => i.status === 'skipped').length,
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
        .filter((i) => i.status === 'failed')
        .map((i) => ({ workItemId: i.id, label: i.label, message: i.lastMessage })),
    };
  }

  private cleanupArtifactDefinition(artifactId: string) {
    const artifact = this.store.artifactDefinitions.get(artifactId);
    if (!artifact) return;
    const isStillLinked = [...this.store.runArtifactLinks.values()].some((link) => link.artifactId === artifactId);
    if (isStillLinked || artifact.canonicalVersionId || artifact.canonicalDocumentId) return;
    this.store.artifactDefinitions.delete(artifactId);
    this.cleanupArtifactContent(artifact.contentId);
  }

  private cleanupArtifactContent(contentId: string) {
    const isStillReferenced = [...this.store.artifactDefinitions.values()].some((a) => a.contentId === contentId);
    if (isStillReferenced) return;
    const content = this.store.artifactContents.get(contentId);
    if (!content) return;
    this.store.artifactContents.delete(contentId);
    this.store.artifactContentIdsByHash.delete(content.hashSha256);
  }
}
