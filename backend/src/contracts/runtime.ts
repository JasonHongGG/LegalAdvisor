import type {
  CrawlArtifact,
  CrawlEvent,
  CrawlSourceRecord,
  CrawlTaskDetail,
  CrawlTaskSummary,
  CreateTaskRequest,
  SourceId,
  TaskStatus,
} from '@legaladvisor/shared';

export type SourceHealthPatch = {
  health_status: string;
  rate_limit_status: string;
  last_checked_at: string;
  last_error_message?: string | null;
};

export type InsertArtifactInput = Omit<CrawlArtifact, 'createdAt'> & { createdAt?: string };

export type InsertEventInput = Omit<CrawlEvent, 'occurredAt'> & { occurredAt?: string };

export type UpsertCheckpointInput = {
  id?: string;
  taskId: string;
  workItemId: string | null;
  checkpointKey: string;
  cursor: Record<string, unknown>;
  updatedAt?: string;
};

export type RunSummaryInput = {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  warningCount: number;
  metadata: Record<string, unknown>;
};

export interface CrawlRepositoryPort {
  ensureSourceCatalog(): Promise<void>;
  listSources(): Promise<CrawlSourceRecord[]>;
  updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch): Promise<void>;
  incrementSourceRequestCount(sourceId: SourceId, amount?: number): Promise<void>;
  createTask(input: CreateTaskRequest): Promise<string>;
  listTaskSummaries(): Promise<CrawlTaskSummary[]>;
  getTaskDetail(taskId: string): Promise<CrawlTaskDetail | null>;
  getTaskStatus(taskId: string): Promise<TaskStatus | null>;
  setTaskStatus(taskId: string, status: TaskStatus, summary?: string): Promise<void>;
  updateTaskManifest(taskId: string, manifestArtifactId: string): Promise<void>;
  upsertRunSummary(taskId: string, manifestArtifactId: string | null, summary: RunSummaryInput): Promise<void>;
  updateWorkItem(workItemId: string, patch: Record<string, unknown>): Promise<void>;
  resetFailedWorkItems(taskId: string): Promise<void>;
  appendEvent(input: InsertEventInput): Promise<void>;
  insertArtifact(input: InsertArtifactInput): Promise<CrawlArtifact>;
  getArtifact(artifactId: string): Promise<CrawlArtifact | null>;
  upsertCheckpoint(input: UpsertCheckpointInput): Promise<void>;
  recomputeTaskStats(taskId: string): Promise<void>;
  getSourceById(sourceId: SourceId): Promise<CrawlSourceRecord | null>;
}

export interface QueueServicePort {
  start(handler: (taskId: string) => Promise<void>): Promise<void>;
  enqueueTask(taskId: string): Promise<void>;
  stop(): Promise<void>;
}