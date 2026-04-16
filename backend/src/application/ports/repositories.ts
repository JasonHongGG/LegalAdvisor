import type {
  ArtifactDto,
  CreateTaskRequestDto,
  SourceId,
  SourceOverviewDto,
  TaskDetailDto,
  TaskEventDto,
  TaskSummaryDto,
  TaskStatus,
} from '@legaladvisor/shared';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';

export type SourceHealthPatch = {
  healthStatus: SourceOverviewDto['healthStatus'];
  rateLimitStatus: SourceOverviewDto['rateLimitStatus'];
  lastCheckedAt: string;
  lastErrorMessage?: string | null;
};

export type InsertArtifactInput = Omit<ArtifactDto, 'createdAt'> & { createdAt?: string };
export type InsertEventInput = Omit<TaskEventDto, 'occurredAt'> & { occurredAt?: string };

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

export type WorkItemPatch = {
  status?: string;
  progress?: number;
  current_stage?: string;
  source_locator?: string | null;
  cursor?: Record<string, unknown> | null;
  last_message?: string;
  items_processed?: number;
  items_total?: number;
  warning_count?: number;
  error_count?: number;
  retry_count?: number;
  started_at?: string | null;
  finished_at?: string | null;
};

export interface SourceRepository {
  ensureSourceCatalog(catalog: SourceCatalogEntry[]): Promise<void>;
  listSources(): Promise<SourceOverviewDto[]>;
  getSourceById(sourceId: SourceId): Promise<SourceOverviewDto | null>;
  updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch): Promise<void>;
  incrementSourceRequestCount(sourceId: SourceId, amount?: number): Promise<void>;
}

export interface TaskRepository {
  createTask(input: CreateTaskRequestDto): Promise<string>;
  listTaskSummaries(): Promise<TaskSummaryDto[]>;
  getTaskDetail(taskId: string): Promise<TaskDetailDto | null>;
  getTaskStatus(taskId: string): Promise<TaskStatus | null>;
  setTaskStatus(taskId: string, status: TaskStatus, summary?: string): Promise<void>;
  updateTaskManifest(taskId: string, manifestArtifactId: string): Promise<void>;
  upsertRunSummary(taskId: string, manifestArtifactId: string | null, summary: RunSummaryInput): Promise<void>;
  updateWorkItem(workItemId: string, patch: WorkItemPatch): Promise<void>;
  resetFailedWorkItems(taskId: string): Promise<void>;
  recomputeTaskStats(taskId: string): Promise<void>;
}

export interface ArtifactRepository {
  insertArtifact(input: InsertArtifactInput): Promise<ArtifactDto>;
  getArtifact(artifactId: string): Promise<ArtifactDto | null>;
}

export interface EventRepository {
  appendEvent(input: InsertEventInput): Promise<void>;
}

export interface CheckpointRepository {
  upsertCheckpoint(input: UpsertCheckpointInput): Promise<void>;
}