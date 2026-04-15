import type {
  CreateTaskRequest,
  CrawlArtifact,
  CrawlTaskDetail,
  EventLevel,
  EventType,
  SourceId,
  TaskControlResponse,
  TaskTargetConfig,
} from '@legaladvisor/shared';
import { createTaskRequestSchema } from '@legaladvisor/shared';
import { getAdapter } from '../adapters/index.js';
import type { AdapterContext } from '../adapters/base.js';
import type { CrawlRepositoryPort, QueueServicePort } from '../contracts/runtime.js';
import { createId, safeFileName } from '../utils.js';
import type { EventBus } from './eventBus.js';
import type { SourceHealthService } from './sourceHealthService.js';
import { StorageService } from './storageService.js';

function taskUpdateEvent(taskId: string) {
  return {
    kind: 'task-updated' as const,
    taskId,
    occurredAt: new Date().toISOString(),
  };
}

export class TaskService {
  constructor(
    private readonly repository: CrawlRepositoryPort,
    private readonly storageService: StorageService,
    private readonly eventBus: EventBus,
    private readonly queueService: QueueServicePort,
    private readonly sourceHealthService: SourceHealthService,
  ) {}

  async bootstrap() {
    await this.repository.ensureSourceCatalog();
    await this.sourceHealthService.refreshAll();
  }

  async listSources() {
    return this.repository.listSources();
  }

  async refreshSources() {
    await this.sourceHealthService.refreshAll();
    const sources = await this.repository.listSources();
    for (const source of sources) {
      this.eventBus.publish({ kind: 'source-updated', sourceId: source.id, occurredAt: new Date().toISOString() });
    }
    return sources;
  }

  async listTasks() {
    return this.repository.listTaskSummaries();
  }

  async getTaskDetail(taskId: string) {
    return this.repository.getTaskDetail(taskId);
  }

  async createTask(payload: CreateTaskRequest) {
    const input = createTaskRequestSchema.parse(payload);
    const taskId = await this.repository.createTask(input);
    await this.repository.setTaskStatus(taskId, 'queued', '任務已建立，等待工作器接手');
    this.eventBus.publish({ kind: 'task-created', taskId, occurredAt: new Date().toISOString() });
    await this.queueService.enqueueTask(taskId);
    return this.getTaskOrThrow(taskId);
  }

  async pauseTask(taskId: string): Promise<TaskControlResponse> {
    await this.getTaskOrThrow(taskId);
    await this.repository.setTaskStatus(taskId, 'paused', '任務已暫停');
    await this.appendTaskEvent(taskId, null, 'task-status', 'info', '已收到暫停指令。');
    this.eventBus.publish(taskUpdateEvent(taskId));
    return { taskId, status: 'paused' };
  }

  async resumeTask(taskId: string): Promise<TaskControlResponse> {
    await this.getTaskOrThrow(taskId);
    await this.repository.setTaskStatus(taskId, 'queued', '任務已恢復，重新排入佇列');
    await this.appendTaskEvent(taskId, null, 'task-status', 'info', '已重新排入佇列。');
    await this.queueService.enqueueTask(taskId);
    this.eventBus.publish(taskUpdateEvent(taskId));
    return { taskId, status: 'queued' };
  }

  async cancelTask(taskId: string): Promise<TaskControlResponse> {
    await this.getTaskOrThrow(taskId);
    await this.repository.setTaskStatus(taskId, 'cancelled', '任務已取消');
    await this.appendTaskEvent(taskId, null, 'task-status', 'warning', '已收到取消指令，工作器會在安全點停止。');
    this.eventBus.publish(taskUpdateEvent(taskId));
    return { taskId, status: 'cancelled' };
  }

  async retryFailedItems(taskId: string): Promise<TaskControlResponse> {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.workItems.some((item) => item.status === 'failed')) {
      return { taskId, status: task.status };
    }

    await this.repository.resetFailedWorkItems(taskId);
    await this.repository.recomputeTaskStats(taskId);
    await this.repository.setTaskStatus(taskId, 'queued', '失敗項目已重排佇列');
    await this.appendTaskEvent(taskId, null, 'task-status', 'info', '失敗 work item 已重排佇列。');
    await this.queueService.enqueueTask(taskId);
    this.eventBus.publish(taskUpdateEvent(taskId));
    return { taskId, status: 'queued' };
  }

  async downloadArtifact(artifactId: string) {
    const artifact = await this.repository.getArtifact(artifactId);
    if (!artifact) {
      throw new Error('Artifact not found');
    }
    const buffer = await this.storageService.download(artifact.storagePath);
    return {
      artifact,
      buffer,
    };
  }

  async downloadManifest(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.manifest) {
      throw new Error('Manifest not generated yet');
    }
    const buffer = Buffer.from(JSON.stringify(task.manifest, null, 2), 'utf-8');
    return {
      fileName: `task-${safeFileName(taskId)}-manifest.json`,
      contentType: 'application/json; charset=utf-8',
      buffer,
    };
  }

  async processTask(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if (['paused', 'cancelled'].includes(task.status)) {
      return;
    }

    await this.repository.setTaskStatus(taskId, 'running', '工作器執行中');
    await this.appendTaskEvent(taskId, null, 'task-status', 'info', '工作器開始執行任務。');
    this.eventBus.publish(taskUpdateEvent(taskId));

    for (const workItem of task.workItems.filter((item) => item.status === 'pending' || item.status === 'failed')) {
      const latestStatus = await this.repository.getTaskStatus(taskId);
      if (!latestStatus || ['paused', 'cancelled'].includes(latestStatus)) {
        break;
      }

      const target = task.targets.find((entry) => entry.id === workItem.taskTargetId)?.config as TaskTargetConfig | undefined;
      if (!target) {
        await this.failWorkItem(taskId, workItem.id, '找不到對應的 target 設定。');
        continue;
      }

      const source = await this.repository.getSourceById(task.sourceId as SourceId);
      if (!source) {
        throw new Error(`Source ${task.sourceId} not found`);
      }
      const adapter = getAdapter(task.sourceId as SourceId);
      const adapterContext = this.createAdapterContext(taskId, workItem.id, source, target);

      try {
        await adapter.run(adapterContext);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown adapter error';
        await this.failWorkItem(taskId, workItem.id, message);
      } finally {
        await this.repository.recomputeTaskStats(taskId);
        this.eventBus.publish(taskUpdateEvent(taskId));
      }
    }

    await this.repository.recomputeTaskStats(taskId);
    const refreshed = await this.getTaskOrThrow(taskId);
    if (refreshed.artifacts.length) {
      await this.generateManifest(refreshed);
    }
    this.eventBus.publish(taskUpdateEvent(taskId));
  }

  private createAdapterContext(taskId: string, workItemId: string, source: Awaited<ReturnType<CrawlRepositoryPort['getSourceById']>> extends infer T ? NonNullable<T> : never, target: TaskTargetConfig): AdapterContext {
    return {
      taskId,
      workItemId,
      source,
      target,
      updateWorkItem: async (patch) => {
        await this.repository.updateWorkItem(workItemId, {
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
        await this.repository.recomputeTaskStats(taskId);
        this.eventBus.publish(taskUpdateEvent(taskId));
      },
      emit: async (level: EventLevel, eventType: EventType, message: string, details: Record<string, unknown> = {}) => {
        await this.appendTaskEvent(taskId, workItemId, eventType, level, message, details);
        this.eventBus.publish(taskUpdateEvent(taskId));
      },
      checkpoint: async (checkpointKey: string, cursor: Record<string, unknown>) => {
        await this.repository.upsertCheckpoint({
          taskId,
          workItemId,
          checkpointKey,
          cursor,
        });
        await this.appendTaskEvent(taskId, workItemId, 'checkpoint-updated', 'info', `Checkpoint 已更新：${checkpointKey}`, { checkpointKey, cursor });
      },
      writeJsonArtifact: async (artifactKind, baseName, data, metadata = {}) => {
        const stored = await this.storageService.writeJson({
          sourceId: source.id,
          taskId,
          workItemId,
          artifactKind,
          baseName,
          data,
          metadata,
        });
        await this.persistArtifact(taskId, workItemId, artifactKind, stored);
        return stored;
      },
      writeMarkdownArtifact: async (artifactKind, baseName, content, metadata = {}) => {
        const stored = await this.storageService.writeMarkdown({
          sourceId: source.id,
          taskId,
          workItemId,
          artifactKind,
          baseName,
          content,
          metadata,
        });
        await this.persistArtifact(taskId, workItemId, artifactKind, stored);
        return stored;
      },
      markRateLimit: async (status, message) => {
        const currentTaskStatus = await this.repository.getTaskStatus(taskId);
        await this.repository.updateSourceHealth(source.id, {
          health_status: source.healthStatus,
          rate_limit_status: status,
          last_checked_at: new Date().toISOString(),
          last_error_message: message ?? null,
        });
        if (status === 'throttled') {
          await this.repository.setTaskStatus(taskId, 'throttled', message ?? '來源限流中');
        } else if (currentTaskStatus === 'throttled') {
          await this.repository.setTaskStatus(taskId, 'running', '來源恢復正常，繼續執行');
        }
        this.eventBus.publish({ kind: 'source-updated', sourceId: source.id, occurredAt: new Date().toISOString() });
        this.eventBus.publish(taskUpdateEvent(taskId));
      },
      incrementSourceRequestCount: async (amount = 1) => {
        await this.repository.incrementSourceRequestCount(source.id, amount);
        this.eventBus.publish({ kind: 'source-updated', sourceId: source.id, occurredAt: new Date().toISOString() });
      },
    };
  }

  private async persistArtifact(taskId: string, workItemId: string | null, artifactKind: CrawlArtifact['artifactKind'], stored: {
    artifactKind: CrawlArtifact['artifactKind'];
    fileName: string;
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    hashSha256: string;
    metadata: Record<string, unknown>;
  }) {
    await this.repository.insertArtifact({
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
    await this.appendTaskEvent(taskId, workItemId, 'artifact-emitted', 'info', `已輸出 ${artifactKind}`, {
      fileName: stored.fileName,
      storagePath: stored.storagePath,
    });
  }

  private async failWorkItem(taskId: string, workItemId: string, message: string) {
    const task = await this.getTaskOrThrow(taskId);
    const workItem = task.workItems.find((entry) => entry.id === workItemId);
    await this.repository.updateWorkItem(workItemId, {
      status: 'failed',
      current_stage: 'failed',
      last_message: message,
      error_count: (workItem?.errorCount ?? 0) + 1,
      finished_at: new Date().toISOString(),
    });
    await this.appendTaskEvent(taskId, workItemId, 'work-item-status', 'error', message);
  }

  private async appendTaskEvent(taskId: string, workItemId: string | null, eventType: EventType, level: EventLevel, message: string, details: Record<string, unknown> = {}) {
    await this.repository.appendEvent({
      id: createId(),
      taskId,
      workItemId,
      eventType,
      level,
      message,
      details,
    });
  }

  private async generateManifest(task: CrawlTaskDetail) {
    if (!task.manifest) {
      return;
    }

    const stored = await this.storageService.writeJson({
      sourceId: task.sourceId,
      taskId: task.id,
      workItemId: null,
      artifactKind: 'batch_manifest',
      baseName: `task-${task.id}-manifest`,
      data: task.manifest,
      metadata: {
        sourceId: task.sourceId,
        status: task.status,
      },
    });

    const artifactId = createId();
    await this.repository.insertArtifact({
      id: artifactId,
      taskId: task.id,
      workItemId: null,
      artifactKind: 'batch_manifest',
      fileName: stored.fileName,
      storagePath: stored.storagePath,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      hashSha256: stored.hashSha256,
      schemaVersion: '1.0.0',
      metadata: stored.metadata,
    });
    await this.repository.updateTaskManifest(task.id, artifactId);
    await this.repository.upsertRunSummary(task.id, artifactId, {
      successCount: task.completedWorkItems,
      failedCount: task.failedWorkItems,
      skippedCount: task.workItems.filter((item) => item.status === 'skipped').length,
      warningCount: task.warningCount,
      metadata: {
        artifactCount: task.artifacts.length + 1,
      },
    });
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.repository.getTaskDetail(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    return task;
  }
}
