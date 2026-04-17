import type {
  ArtifactKind,
  EventLevel,
  EventType,
  SourceOverviewDto,
  RunDetailDto,
  RunTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';
import type { ArtifactRepository, RunRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort, RunExecutionReporter } from '../ports/runtime.js';
import type { ArtifactWriteResult } from '../ports/runtime.js';
import type { LawArtifactRegistryService } from '../services/lawArtifactRegistryService.js';
import type { RunLifecycleService } from '../services/runLifecycleService.js';
import { createId } from '../../utils.js';

type RunExecutionContext = {
  runId: string;
  workItemId: string;
  source: SourceOverviewDto;
  target: RunTargetConfig;
  beginStage(stage: Exclude<WorkItemDto['status'], 'pending' | 'skipped' | 'failed'>, payload: {
    progress?: number;
    message: string;
    sourceLocator?: string | null;
    cursor?: Record<string, unknown> | null;
    itemsProcessed?: number;
    itemsTotal?: number;
    warningCount?: number;
    errorCount?: number;
    retryCount?: number;
  }): Promise<void>;
  advance(payload: {
    progress?: number;
    message?: string;
    sourceLocator?: string | null;
    cursor?: Record<string, unknown> | null;
    itemsProcessed?: number;
    itemsTotal?: number;
    warningCount?: number;
    errorCount?: number;
    retryCount?: number;
  }): Promise<void>;
  complete(payload: {
    progress?: number;
    message: string;
    sourceLocator?: string | null;
    cursor?: Record<string, unknown> | null;
    itemsProcessed?: number;
    itemsTotal?: number;
    warningCount?: number;
    errorCount?: number;
    retryCount?: number;
  }): Promise<void>;
  emit(level: EventLevel, eventType: EventType, message: string, details?: Record<string, unknown>): Promise<void>;
  writeJsonArtifact(artifactKind: ArtifactKind, baseName: string, data: unknown, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  writeMarkdownArtifact(artifactKind: ArtifactKind, baseName: string, content: string, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  persistLawArtifacts(input: {
    lawName: string;
    lawLevel: string;
    lawUrl: string;
    category: string;
    modifiedDate: string;
    effectiveDate: string;
    effectiveNote: string;
    abandonNote: string;
    hasEnglishVersion: boolean;
    englishName: string;
    sourceUpdateDate: string;
    query: string;
    exactMatch: boolean;
    articleEntries: Array<{
      type: string;
      no: string;
      content: string;
    }>;
    histories: string;
    documentMarkdown: string;
  }): Promise<{
    contentStatus: 'new' | 'reused';
    canonicalDocumentId: string;
    canonicalVersionId: string;
  }>;
};

export class RunExecutionContextFactory {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
    private readonly runActivityReporter: RunExecutionReporter,
    private readonly lawArtifactRegistry: LawArtifactRegistryService,
    private readonly runLifecycleService: RunLifecycleService,
  ) {}

  async create(params: {
    run: RunDetailDto;
    workItem: WorkItemDto;
    source: SourceOverviewDto;
    target: RunTargetConfig;
  }): Promise<RunExecutionContext> {
    const applyWorkItemPatch = async (patch: {
      status?: WorkItemDto['status'];
      progress?: number;
      currentStage?: string;
      sourceLocator?: string | null;
      cursor?: Record<string, unknown> | null;
      lastMessage?: string;
      itemsProcessed?: number;
      itemsTotal?: number;
      warningCount?: number;
      errorCount?: number;
      retryCount?: number;
      startedAt?: string | null;
      finishedAt?: string | null;
    }) => {
      const currentRun = await this.requireRun(params.run.id);
      const currentWorkItem = currentRun.workItems.find((entry) => entry.id === params.workItem.id) ?? null;

      await this.runRepository.updateWorkItem(params.workItem.id, {
        status: patch.status,
        progress: patch.progress,
        current_stage: patch.currentStage,
        source_locator: patch.sourceLocator,
        cursor: patch.cursor,
        last_message: patch.lastMessage,
        items_processed: patch.itemsProcessed,
        items_total: patch.itemsTotal,
        warning_count: patch.warningCount,
        error_count: patch.errorCount,
        retry_count: patch.retryCount,
        started_at: patch.startedAt,
        finished_at: patch.finishedAt,
      });

      const statusEvent = this.buildWorkItemStatusEvent(currentWorkItem, patch);
      if (statusEvent) {
        await this.runActivityReporter.appendRunEvent(
          params.run.id,
          params.workItem.id,
          'work-item-status',
          statusEvent.level,
          statusEvent.message,
          statusEvent.details,
        );
      }

      const progressEvent = this.buildWorkItemProgressEvent(currentWorkItem, patch);
      if (progressEvent) {
        await this.runActivityReporter.appendRunEvent(
          params.run.id,
          params.workItem.id,
          'work-item-progress',
          progressEvent.level,
          progressEvent.message,
          progressEvent.details,
        );
      }

      await this.runLifecycleService.recomputeRun(params.run.id);
    };

    return {
      runId: params.run.id,
      workItemId: params.workItem.id,
      source: params.source,
      target: params.target,
      beginStage: async (stage, payload) => {
        await applyWorkItemPatch({
          status: stage,
          currentStage: stage,
          progress: payload.progress,
          sourceLocator: payload.sourceLocator,
          cursor: payload.cursor,
          lastMessage: payload.message,
          itemsProcessed: payload.itemsProcessed,
          itemsTotal: payload.itemsTotal,
          warningCount: payload.warningCount,
          errorCount: payload.errorCount,
          retryCount: payload.retryCount,
        });
      },
      advance: async (payload) => {
        await applyWorkItemPatch({
          progress: payload.progress,
          sourceLocator: payload.sourceLocator,
          cursor: payload.cursor,
          lastMessage: payload.message,
          itemsProcessed: payload.itemsProcessed,
          itemsTotal: payload.itemsTotal,
          warningCount: payload.warningCount,
          errorCount: payload.errorCount,
          retryCount: payload.retryCount,
        });
      },
      complete: async (payload) => {
        await applyWorkItemPatch({
          status: 'done',
          currentStage: 'done',
          progress: payload.progress ?? 100,
          sourceLocator: payload.sourceLocator,
          cursor: payload.cursor,
          lastMessage: payload.message,
          itemsProcessed: payload.itemsProcessed,
          itemsTotal: payload.itemsTotal,
          warningCount: payload.warningCount,
          errorCount: payload.errorCount,
          retryCount: payload.retryCount,
          finishedAt: new Date().toISOString(),
        });
      },
      emit: async (level, eventType, message, details = {}) => {
        await this.runActivityReporter.appendRunEvent(params.run.id, params.workItem.id, eventType, level, message, details);
      },
      writeJsonArtifact: async (artifactKind, baseName, data, metadata = {}) => {
        const stored = await this.artifactStorage.writeJson({
          sourceId: params.source.id,
          runId: params.run.id,
          workItemId: params.workItem.id,
          artifactKind,
          baseName,
          data,
          metadata,
        });
        await this.persistArtifact(params.run.id, params.workItem.id, artifactKind, stored);
        return stored;
      },
      writeMarkdownArtifact: async (artifactKind, baseName, content, metadata = {}) => {
        const stored = await this.artifactStorage.writeMarkdown({
          sourceId: params.source.id,
          runId: params.run.id,
          workItemId: params.workItem.id,
          artifactKind,
          baseName,
          content,
          metadata,
        });
        await this.persistArtifact(params.run.id, params.workItem.id, artifactKind, stored);
        return stored;
      },
      persistLawArtifacts: async (input) => {
        const result = await this.lawArtifactRegistry.persistRunLawArtifacts({
          ...input,
          runId: params.run.id,
          workItemId: params.workItem.id,
          sourceId: params.source.id,
        });

        await this.runActivityReporter.appendRunEvent(
          params.run.id,
          params.workItem.id,
          'artifact-emitted',
          'info',
          result.contentStatus === 'new' ? `已建立 ${input.lawName} 的新法條版本。` : `重用既有 ${input.lawName} 法條版本。`,
          {
            lawName: input.lawName,
            contentStatus: result.contentStatus,
            canonicalDocumentId: result.canonicalDocumentId,
            canonicalVersionId: result.canonicalVersionId,
          },
        );
        return result;
      },
    };
  }

  private async persistArtifact(runId: string, workItemId: string | null, artifactKind: ArtifactKind, stored: ArtifactWriteResult) {
    const content = await this.artifactRepository.ensureArtifactContent({
      hashSha256: stored.hashSha256,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      encoding: stored.encoding,
      buffer: stored.buffer,
    });

    await this.artifactRepository.insertArtifact({
      id: createId(),
      runId,
      workItemId,
      artifactKind,
      artifactRole: this.inferArtifactRole(artifactKind, stored.metadata),
      contentStatus: 'run-only',
      canonicalDocumentId: null,
      canonicalVersionId: null,
      fileName: stored.fileName,
      contentId: content.id,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      hashSha256: stored.hashSha256,
      schemaVersion: '1.0.0',
      metadata: stored.metadata,
    });
    await this.runActivityReporter.appendRunEvent(runId, workItemId, 'artifact-emitted', 'info', `已輸出 ${artifactKind}`, {
      fileName: stored.fileName,
      hashSha256: stored.hashSha256,
    });
  }

  private inferArtifactRole(artifactKind: ArtifactKind, metadata: Record<string, unknown>) {
    const metadataRole = metadata.artifactRole;
    if (typeof metadataRole === 'string') {
      return metadataRole as 'machine-source' | 'provenance' | 'version-evidence' | 'review-output' | 'crawler-output' | 'debug';
    }

    switch (artifactKind) {
      case 'law_source_snapshot':
        return 'provenance';
      case 'law_article_snapshot':
        return 'machine-source';
      case 'law_revision_snapshot':
        return 'version-evidence';
      case 'law_document_snapshot':
      case 'judicial_site_markdown':
      case 'judgment_document_snapshot':
        return 'review-output';
      case 'debug_payload':
        return 'debug';
      default:
        return 'crawler-output';
    }
  }

  private buildWorkItemStatusEvent(
    currentWorkItem: WorkItemDto | null,
    patch: {
      status?: WorkItemDto['status'];
      progress?: number;
      currentStage?: string;
      sourceLocator?: string | null;
      cursor?: Record<string, unknown> | null;
      lastMessage?: string;
      itemsProcessed?: number;
      itemsTotal?: number;
      warningCount?: number;
      errorCount?: number;
      retryCount?: number;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ) {
    if (!currentWorkItem) {
      return null;
    }

    const statusChanged = patch.status !== undefined && patch.status !== currentWorkItem.status;
    const stageChanged = patch.currentStage !== undefined && patch.currentStage !== currentWorkItem.currentStage;
    const startedChanged = patch.startedAt !== undefined && patch.startedAt !== currentWorkItem.startedAt;
    const finishedChanged = patch.finishedAt !== undefined && patch.finishedAt !== currentWorkItem.finishedAt;

    if (!statusChanged && !stageChanged && !startedChanged && !finishedChanged) {
      return null;
    }

    const nextStatus = patch.status ?? currentWorkItem.status;
    const nextStage = patch.currentStage ?? currentWorkItem.currentStage;
    const nextMessage = patch.lastMessage ?? currentWorkItem.lastMessage;

    return {
      level: nextStatus === 'failed' ? 'error' as const : 'info' as const,
      message: nextMessage || `狀態更新：${nextStage}`,
      details: {
        status: nextStatus,
        currentStage: nextStage,
        label: currentWorkItem.label,
        itemsProcessed: patch.itemsProcessed ?? currentWorkItem.itemsProcessed,
        itemsTotal: patch.itemsTotal ?? currentWorkItem.itemsTotal,
      },
    };
  }

  private buildWorkItemProgressEvent(
    currentWorkItem: WorkItemDto | null,
    patch: {
      status?: WorkItemDto['status'];
      progress?: number;
      currentStage?: string;
      sourceLocator?: string | null;
      cursor?: Record<string, unknown> | null;
      lastMessage?: string;
      itemsProcessed?: number;
      itemsTotal?: number;
      warningCount?: number;
      errorCount?: number;
      retryCount?: number;
      startedAt?: string | null;
      finishedAt?: string | null;
    },
  ) {
    if (!currentWorkItem) {
      return null;
    }

    const itemsProcessedChanged = patch.itemsProcessed !== undefined && patch.itemsProcessed !== currentWorkItem.itemsProcessed;
    const progressChanged = patch.progress !== undefined && patch.progress !== currentWorkItem.progress;
    const messageChanged = patch.lastMessage !== undefined && patch.lastMessage !== currentWorkItem.lastMessage;

    if (!itemsProcessedChanged && !progressChanged && !messageChanged) {
      return null;
    }

    const nextStatus = patch.status ?? currentWorkItem.status;
    if (['done', 'failed', 'skipped'].includes(nextStatus)) {
      return null;
    }

    return {
      level: 'info' as const,
      message: patch.lastMessage ?? currentWorkItem.lastMessage ?? '執行進度已更新。',
      details: {
        status: nextStatus,
        currentStage: patch.currentStage ?? currentWorkItem.currentStage,
        label: currentWorkItem.label,
        itemsProcessed: patch.itemsProcessed ?? currentWorkItem.itemsProcessed,
        itemsTotal: patch.itemsTotal ?? currentWorkItem.itemsTotal,
        progress: patch.progress ?? currentWorkItem.progress,
      },
    };
  }

  private async requireRun(runId: string) {
    const run = await this.runRepository.getRunDetail(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found while building execution context`);
    }
    return run;
  }
}