import type {
  ArtifactKind,
  SourceOverviewDto,
  EventLevel,
  EventType,
  SourceId,
  TaskTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';
import type { ArtifactWriteResult } from '../application/ports/runtime.js';

export interface AdapterContext {
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
}

export interface SourceAdapter {
  readonly sourceId: SourceId;
  run(context: AdapterContext): Promise<void>;
}
