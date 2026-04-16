import type {
  ArtifactKind,
  EventLevel,
  EventType,
  SourceOverviewDto,
  TaskDetailDto,
  TaskTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';
import type { ArtifactRepository, CheckpointRepository, SourceRepository, TaskRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort, TaskExecutionReporter } from '../ports/runtime.js';
import type { ArtifactWriteResult } from '../ports/runtime.js';
import { createId } from '../../utils.js';

type TaskExecutionContext = {
  taskId: string;
  workItemId: string;
  source: SourceOverviewDto;
  target: TaskTargetConfig;
  getCheckpoint(checkpointKey: string): Record<string, unknown> | null;
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
  checkpoint(checkpointKey: string, cursor: Record<string, unknown>): Promise<void>;
  writeJsonArtifact(artifactKind: ArtifactKind, baseName: string, data: unknown, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  writeMarkdownArtifact(artifactKind: ArtifactKind, baseName: string, content: string, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  markRateLimit(status: 'normal' | 'throttled' | 'blocked', message?: string): Promise<void>;
  incrementSourceRequestCount(amount?: number): Promise<void>;
};

export class TaskExecutionContextFactory {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly checkpointRepository: CheckpointRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly artifactStorage: ArtifactStoragePort,
    private readonly taskActivityReporter: TaskExecutionReporter,
  ) {}

  async create(params: {
    task: TaskDetailDto;
    workItem: WorkItemDto;
    source: SourceOverviewDto;
    target: TaskTargetConfig;
  }): Promise<TaskExecutionContext> {
    const checkpointCache = new Map(
      params.task.checkpoints
        .filter((checkpoint) => checkpoint.workItemId === params.workItem.id)
        .map((checkpoint) => [checkpoint.checkpointKey, checkpoint.cursor]),
    );

    return {
      taskId: params.task.id,
      workItemId: params.workItem.id,
      source: params.source,
      target: params.target,
      getCheckpoint: (checkpointKey) => checkpointCache.get(checkpointKey) ?? null,
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
      checkpoint: async (checkpointKey, cursor) => {
        checkpointCache.set(checkpointKey, cursor);
        await this.checkpointRepository.upsertCheckpoint({
          taskId: params.task.id,
          workItemId: params.workItem.id,
          checkpointKey,
          cursor,
        });
        await this.taskActivityReporter.appendTaskEvent(params.task.id, params.workItem.id, 'checkpoint-updated', 'info', `Checkpoint 已更新：${checkpointKey}`, {
          checkpointKey,
          cursor,
        });
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
      markRateLimit: async (status, message) => {
        const currentTaskStatus = await this.taskRepository.getTaskStatus(params.task.id);
        await this.sourceRepository.updateSourceHealth(params.source.id, {
          healthStatus: params.source.healthStatus,
          rateLimitStatus: status,
          lastCheckedAt: new Date().toISOString(),
          lastErrorMessage: message ?? null,
        });

        if (status === 'throttled') {
          await this.taskRepository.setTaskStatus(params.task.id, 'throttled', message ?? '來源限流中');
        } else if (currentTaskStatus === 'throttled') {
          await this.taskRepository.setTaskStatus(params.task.id, 'running', '來源恢復正常，繼續執行');
        }

        this.taskActivityReporter.publishSourceUpdated(params.source.id);
        this.taskActivityReporter.publishTaskUpdated(params.task.id);
      },
      incrementSourceRequestCount: async (amount = 1) => {
        await this.sourceRepository.incrementSourceRequestCount(params.source.id, amount);
        this.taskActivityReporter.publishSourceUpdated(params.source.id);
      },
    };
  }

  private async persistArtifact(taskId: string, workItemId: string | null, artifactKind: ArtifactKind, stored: ArtifactWriteResult) {
    await this.artifactRepository.insertArtifact({
      id: createId(),
      taskId,
      workItemId,
      artifactKind,
      fileName: stored.fileName,
      storagePath: stored.storagePath,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      hashSha256: stored.hashSha256,
      schemaVersion: '1.0.0',
      metadata: stored.metadata,
    });
    await this.taskActivityReporter.appendTaskEvent(taskId, workItemId, 'artifact-emitted', 'info', `已輸出 ${artifactKind}`, {
      fileName: stored.fileName,
      storagePath: stored.storagePath,
    });
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