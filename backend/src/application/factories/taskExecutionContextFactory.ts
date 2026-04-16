import type {
  ArtifactKind,
  EventLevel,
  EventType,
  SourceOverviewDto,
  TaskDetailDto,
  TaskTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';
import type { ArtifactRepository, TaskRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort, TaskExecutionReporter } from '../ports/runtime.js';
import type { ArtifactWriteResult } from '../ports/runtime.js';
import type { LawArtifactRegistryService } from '../services/lawArtifactRegistryService.js';
import { createId } from '../../utils.js';

type TaskExecutionContext = {
  taskId: string;
  workItemId: string;
  source: SourceOverviewDto;
  target: TaskTargetConfig;
  updateWorkItem(patch: {
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

export class TaskExecutionContextFactory {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
    private readonly taskActivityReporter: TaskExecutionReporter,
    private readonly lawArtifactRegistry: LawArtifactRegistryService,
  ) {}

  async create(params: {
    task: TaskDetailDto;
    workItem: WorkItemDto;
    source: SourceOverviewDto;
    target: TaskTargetConfig;
  }): Promise<TaskExecutionContext> {
    return {
      taskId: params.task.id,
      workItemId: params.workItem.id,
      source: params.source,
      target: params.target,
      updateWorkItem: async (patch) => {
        const currentTask = await this.requireTask(params.task.id);
        const currentWorkItem = currentTask.workItems.find((entry) => entry.id === params.workItem.id) ?? null;

        await this.taskRepository.updateWorkItem(params.workItem.id, {
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
          await this.taskActivityReporter.appendTaskEvent(
            params.task.id,
            params.workItem.id,
            'work-item-status',
            statusEvent.level,
            statusEvent.message,
            statusEvent.details,
          );
        }

        await this.taskRepository.recomputeTaskStats(params.task.id);
        this.taskActivityReporter.publishTaskUpdated(params.task.id);
      },
      emit: async (level, eventType, message, details = {}) => {
        await this.taskActivityReporter.appendTaskEvent(params.task.id, params.workItem.id, eventType, level, message, details);
        this.taskActivityReporter.publishTaskUpdated(params.task.id);
      },
      writeJsonArtifact: async (artifactKind, baseName, data, metadata = {}) => {
        const stored = await this.artifactStorage.writeJson({
          sourceId: params.source.id,
          taskId: params.task.id,
          workItemId: params.workItem.id,
          artifactKind,
          baseName,
          data,
          metadata,
        });
        await this.persistArtifact(params.task.id, params.workItem.id, artifactKind, stored);
        return stored;
      },
      writeMarkdownArtifact: async (artifactKind, baseName, content, metadata = {}) => {
        const stored = await this.artifactStorage.writeMarkdown({
          sourceId: params.source.id,
          taskId: params.task.id,
          workItemId: params.workItem.id,
          artifactKind,
          baseName,
          content,
          metadata,
        });
        await this.persistArtifact(params.task.id, params.workItem.id, artifactKind, stored);
        return stored;
      },
      persistLawArtifacts: async (input) => {
        const result = await this.lawArtifactRegistry.persistTaskLawArtifacts({
          ...input,
          taskId: params.task.id,
          workItemId: params.workItem.id,
          sourceId: params.source.id,
        });

        await this.taskActivityReporter.appendTaskEvent(
          params.task.id,
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
        this.taskActivityReporter.publishTaskUpdated(params.task.id);
        return result;
      },
    };
  }

  private async persistArtifact(taskId: string, workItemId: string | null, artifactKind: ArtifactKind, stored: ArtifactWriteResult) {
    const content = await this.artifactRepository.ensureArtifactContent({
      hashSha256: stored.hashSha256,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      encoding: stored.encoding,
      buffer: stored.buffer,
    });

    await this.artifactRepository.insertArtifact({
      id: createId(),
      taskId,
      workItemId,
      artifactKind,
      artifactRole: this.inferArtifactRole(artifactKind, stored.metadata),
      contentStatus: 'task-only',
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
    await this.taskActivityReporter.appendTaskEvent(taskId, workItemId, 'artifact-emitted', 'info', `已輸出 ${artifactKind}`, {
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

  private async requireTask(taskId: string) {
    const task = await this.taskRepository.getTaskDetail(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found while building execution context`);
    }
    return task;
  }
}