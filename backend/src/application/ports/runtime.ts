import type { Response } from 'express';
import type {
  ArtifactKind,
  EventLevel,
  EventType,
  SourceOverviewDto,
} from '@legaladvisor/shared';
import type { TaskStreamEvent } from '@legaladvisor/shared';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';

export interface ArtifactWriteResult {
  artifactKind: ArtifactKind;
  fileName: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  metadata: Record<string, unknown>;
}

export interface ArtifactStoragePort {
  writeJson(params: {
    sourceId: string;
    taskId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    data: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactWriteResult>;
  writeMarkdown(params: {
    sourceId: string;
    taskId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactWriteResult>;
  download(storagePath: string): Promise<Buffer>;
}

export interface TaskQueuePort {
  start(handler: (taskId: string) => Promise<void>): Promise<void>;
  enqueueTask(taskId: string): Promise<void>;
  stop(): Promise<void>;
}

export interface TaskStreamPublisher {
  subscribe(response: Response): void;
  publish(payload: TaskStreamEvent): void;
}

export interface SourceHealthProbe {
  probe(source: SourceCatalogEntry): Promise<{
    healthStatus: SourceOverviewDto['healthStatus'];
    rateLimitStatus: SourceOverviewDto['rateLimitStatus'];
    lastErrorMessage: string | null;
  }>;
}

export interface TaskExecutionReporter {
  appendTaskEvent(
    taskId: string,
    workItemId: string | null,
    eventType: EventType,
    level: EventLevel,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<void>;
  publishTaskCreated(taskId: string): void;
  publishTaskUpdated(taskId: string): void;
  publishSourceUpdated(sourceId: SourceOverviewDto['id']): void;
}