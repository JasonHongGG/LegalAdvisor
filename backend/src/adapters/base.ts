import type {
  ArtifactKind,
  SourceOverviewDto,
  EventLevel,
  SourceId,
  RunTargetConfig,
  WorkItemDto,
} from '@legaladvisor/shared';

export type AdapterEventType = 'log' | 'artifact-emitted';
import type { ArtifactWriteResult } from '../application/ports/runtime.js';

export type WorkItemStage = Exclude<WorkItemDto['status'], 'pending' | 'skipped' | 'failed'>;

export type WorkItemProgressPayload = {
  progress?: number;
  message: string;
  sourceLocator?: string | null;
  cursor?: Record<string, unknown> | null;
  itemsProcessed?: number;
  itemsTotal?: number;
  warningCount?: number;
  errorCount?: number;
  retryCount?: number;
};

export type PersistLawArtifactsInput = {
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
};

export type PersistLawArtifactsResult = {
  contentStatus: 'new' | 'reused';
  canonicalDocumentId: string;
  canonicalVersionId: string;
};

export interface AdapterObservationPort {
  beginStage(stage: WorkItemStage, payload: WorkItemProgressPayload): Promise<void>;
  advance(payload: Partial<Omit<WorkItemProgressPayload, 'message'>> & { message?: string }): Promise<void>;
  complete(payload: Omit<WorkItemProgressPayload, 'progress'> & { progress?: number }): Promise<void>;
}

export interface AdapterArtifactPort {
  writeJson(artifactKind: ArtifactKind, baseName: string, data: unknown, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  writeMarkdown(artifactKind: ArtifactKind, baseName: string, content: string, metadata?: Record<string, unknown>): Promise<ArtifactWriteResult>;
  persistLawArtifacts(input: PersistLawArtifactsInput): Promise<PersistLawArtifactsResult>;
}

export interface AdapterReportingPort {
  emit(level: EventLevel, eventType: AdapterEventType, message: string, details?: Record<string, unknown>): Promise<void>;
}

export interface AdapterContext {
  runId: string;
  workItemId: string;
  source: SourceOverviewDto;
  target: RunTargetConfig;
  observation: AdapterObservationPort;
  artifacts: AdapterArtifactPort;
  reporting: AdapterReportingPort;
}

export interface SourceAdapter {
  readonly sourceId: SourceId;
  buildTargets(fieldValues: Record<string, string | number | boolean | null>): RunTargetConfig[];
  run(context: AdapterContext): Promise<void>;
}

export interface SourceAdapterResolver {
  get(sourceId: SourceId): SourceAdapter;
}
