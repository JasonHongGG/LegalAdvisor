import type {
  ArtifactKind,
  CrawlSourceRecord,
  EventLevel,
  EventType,
  SourceId,
  TaskTargetConfig,
  WorkItemStatus,
} from '@legaladvisor/shared';
import type { StoredArtifact } from '../services/storageService.js';

export interface AdapterContext {
  taskId: string;
  workItemId: string;
  source: CrawlSourceRecord;
  target: TaskTargetConfig;
  updateWorkItem(patch: {
    status?: WorkItemStatus;
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
  writeJsonArtifact(artifactKind: ArtifactKind, baseName: string, data: unknown, metadata?: Record<string, unknown>): Promise<StoredArtifact>;
  writeMarkdownArtifact(artifactKind: ArtifactKind, baseName: string, content: string, metadata?: Record<string, unknown>): Promise<StoredArtifact>;
  markRateLimit(status: 'normal' | 'throttled' | 'blocked', message?: string): Promise<void>;
  incrementSourceRequestCount(amount?: number): Promise<void>;
}

export interface SourceAdapter {
  readonly sourceId: SourceId;
  run(context: AdapterContext): Promise<void>;
}
