import type { Response } from 'express';
import type {
  ArtifactKind,
  EventLevel,
  EventType,
  SourceOverviewDto,
} from '@legaladvisor/shared';
import type { RunStreamEvent } from '@legaladvisor/shared';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';

export interface ArtifactWriteResult {
  artifactKind: ArtifactKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  encoding: 'utf-8' | null;
  buffer: Buffer;
  metadata: Record<string, unknown>;
}

export interface ArtifactStoragePort {
  writeJson(params: {
    sourceId: string;
    runId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    data: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactWriteResult>;
  writeMarkdown(params: {
    sourceId: string;
    runId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactWriteResult>;
}

export interface RunQueuePort {
  start(handler: (runId: string) => Promise<void>): Promise<void>;
  enqueueTask(runId: string): Promise<void>;
  stop(): Promise<void>;
}

export interface RunStreamPublisher {
  subscribe(response: Response): void;
  publish(payload: RunStreamEvent): void;
}

export interface SourceHealthProbe {
  probe(source: SourceCatalogEntry): Promise<{
    healthStatus: SourceOverviewDto['healthStatus'];
    lastErrorMessage: string | null;
  }>;
}

export interface RunExecutionReporter {
  appendRunEvent(
    runId: string,
    workItemId: string | null,
    eventType: EventType,
    level: EventLevel,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<{ sequenceNo: number }>;
  publishRunCreated(runId: string): void;
  publishRunRemoved(runId: string): void;
  publishRunOverviewUpdated(runId: string): void;
  publishRunViewUpdated(runId: string): void;
  publishSourceUpdated(sourceId: SourceOverviewDto['id']): void;
}