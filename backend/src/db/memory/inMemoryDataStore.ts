import type {
  ArtifactDto as CrawlArtifact,
  RunEventDto as CrawlEvent,
  RunSummaryDto as CrawlTaskSummary,
  SourceOverviewDto as CrawlSourceRecord,
  WorkItemDto as CrawlWorkItem,
  SourceId,
} from '@legaladvisor/shared';
import type {
  CanonicalLawDocumentInput,
  CanonicalLawVersionInput,
} from '../../application/ports/repositories.js';

export type ArtifactDefinitionRecord = {
  id: string;
  artifactKind: CrawlArtifact['artifactKind'];
  artifactRole: CrawlArtifact['artifactRole'];
  canonicalDocumentId: string | null;
  canonicalVersionId: string | null;
  fileName: string;
  contentId: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ArtifactContentState = {
  id: string;
  hashSha256: string;
  contentType: string;
  sizeBytes: number;
  encoding: 'utf-8' | 'base64' | null;
  buffer: Buffer;
  createdAt: string;
};

export type RunArtifactLinkRecord = {
  id: string;
  runId: string;
  workItemId: string | null;
  artifactId: string;
  contentStatus: CrawlArtifact['contentStatus'];
  createdAt: string;
};

export type InternalRunState = {
  summary: CrawlTaskSummary;
  workItems: CrawlWorkItem[];
  events: CrawlEvent[];
};

export type CanonicalLawDocumentRecord = CanonicalLawDocumentInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalLawVersionRecord = CanonicalLawVersionInput & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type StageRecord = {
  id: string;
  runId: string;
  workItemId: string;
  stageName: string;
  status: string;
  message: string;
  progress: number;
  itemsProcessed: number;
  itemsTotal: number;
  sourceLocator: string | null;
  sequenceNo: number;
  startedAt: string;
  endedAt: string | null;
};

export class InMemoryDataStore {
  readonly sources = new Map<SourceId, CrawlSourceRecord>();
  readonly runs = new Map<string, InternalRunState>();
  readonly workItemToRun = new Map<string, string>();
  readonly artifactContents = new Map<string, ArtifactContentState>();
  readonly artifactContentIdsByHash = new Map<string, string>();
  readonly artifactDefinitions = new Map<string, ArtifactDefinitionRecord>();
  readonly runArtifactLinks = new Map<string, RunArtifactLinkRecord>();
  readonly canonicalLawDocuments = new Map<string, CanonicalLawDocumentRecord>();
  readonly canonicalLawDocumentKeys = new Map<string, string>();
  readonly canonicalLawVersions = new Map<string, CanonicalLawVersionRecord>();
  readonly canonicalLawVersionKeys = new Map<string, string>();
  readonly stages = new Map<string, StageRecord>();
  nextEventSequenceNo = 1;
  nextStageSequenceNo = 1;

  requireSource(sourceId: SourceId) {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Unknown source ${sourceId}`);
    return source;
  }

  requireRunState(runId: string) {
    const state = this.runs.get(runId);
    if (!state) throw new Error(`Run ${runId} not found`);
    return state;
  }

  requireWorkItem(workItemId: string) {
    const runId = this.workItemToRun.get(workItemId);
    if (!runId) throw new Error(`Work item ${workItemId} not found`);
    const state = this.requireRunState(runId);
    const workItem = state.workItems.find((entry) => entry.id === workItemId);
    if (!workItem) throw new Error(`Work item ${workItemId} not found`);
    return { state, workItem };
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
