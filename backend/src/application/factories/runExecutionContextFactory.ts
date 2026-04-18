import type {
  ArtifactKind,
  SourceOverviewDto,
  RunDetailDto,
  RunTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';
import type {
  AdapterArtifactPort,
  AdapterContext,
  AdapterObservationPort,
  AdapterReportingPort,
  PersistLawArtifactsInput,
  WorkItemProgressPayload,
  WorkItemStage,
} from '../../adapters/base.js';
import type { ArtifactRepository, RunRepository, StageRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort, RunExecutionReporter } from '../ports/runtime.js';
import type { ArtifactWriteResult } from '../ports/runtime.js';
import type { LawArtifactRegistryService } from '../services/lawArtifactRegistryService.js';
import type { RunLifecycleService } from '../services/runLifecycleService.js';
import { createId } from '../../utils.js';

export class RunExecutionContextFactory {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
    private readonly runActivityReporter: RunExecutionReporter,
    private readonly lawArtifactRegistry: LawArtifactRegistryService,
    private readonly runLifecycleService: RunLifecycleService,
    private readonly stageRepository: StageRepository,
  ) {}

  async create(params: {
    run: RunDetailDto;
    workItem: WorkItemDto;
    source: SourceOverviewDto;
    target: RunTargetConfig;
  }): Promise<AdapterContext> {
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

      await this.runLifecycleService.recomputeRun(params.run.id);
    };

    const observation: AdapterObservationPort = {
      beginStage: async (stage: WorkItemStage, payload: WorkItemProgressPayload) => {
        // Close any active stage for this work item
        await this.stageRepository.closeActiveStage(params.workItem.id, new Date().toISOString());

        // Insert new stage
        await this.stageRepository.insertStage({
          id: createId(),
          runId: params.run.id,
          workItemId: params.workItem.id,
          stageName: stage,
          status: 'running',
          message: payload.message,
          progress: payload.progress,
          itemsProcessed: payload.itemsProcessed,
          itemsTotal: payload.itemsTotal,
          sourceLocator: payload.sourceLocator,
        });

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

        this.runActivityReporter.publishRunViewUpdated(params.run.id);
      },
      advance: async (payload) => {
        // Update the current active stage in-place
        const active = await this.stageRepository.getActiveStage(params.workItem.id);
        if (active) {
          await this.stageRepository.updateStage(active.id, {
            message: payload.message,
            progress: payload.progress,
            itemsProcessed: payload.itemsProcessed,
            itemsTotal: payload.itemsTotal,
            sourceLocator: payload.sourceLocator,
          });
        }

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

        this.runActivityReporter.publishRunViewUpdated(params.run.id);
      },
      complete: async (payload) => {
        // Close the last active stage as completed
        const active = await this.stageRepository.getActiveStage(params.workItem.id);
        if (active) {
          await this.stageRepository.updateStage(active.id, {
            status: 'completed',
            message: payload.message,
            progress: payload.progress ?? 100,
            itemsProcessed: payload.itemsProcessed,
            itemsTotal: payload.itemsTotal,
            sourceLocator: payload.sourceLocator,
            endedAt: new Date().toISOString(),
          });
        }

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

        this.runActivityReporter.publishRunViewUpdated(params.run.id);
      },
    };

    const reporting: AdapterReportingPort = {
      emit: async (level, eventType, message, details = {}) => {
        await this.runActivityReporter.appendRunEvent(params.run.id, params.workItem.id, eventType, level, message, details);
      },
    };

    const artifacts: AdapterArtifactPort = {
      writeJson: async (artifactKind, baseName, data, metadata = {}) => {
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
      writeMarkdown: async (artifactKind, baseName, content, metadata = {}) => {
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
      persistLawArtifacts: async (input: PersistLawArtifactsInput) => {
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

    return {
      runId: params.run.id,
      workItemId: params.workItem.id,
      source: params.source,
      target: params.target,
      observation,
      artifacts,
      reporting,
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

  private async requireRun(runId: string) {
    const run = await this.runRepository.getRunDetail(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found while building execution context`);
    }
    return run;
  }
}