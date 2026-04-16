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
}

export interface SourceAdapter {
  readonly sourceId: SourceId;
  run(context: AdapterContext): Promise<void>;
}
