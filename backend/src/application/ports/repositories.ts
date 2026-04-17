import type {
  ArtifactDto,
  ArtifactContentStatus,
  CreateRunRequestDto,
  SourceId,
  SourceOverviewDto,
  RunDetailDto,
  RunEventDto,
  RunTimelineEntryDto,
  RunSummaryDto,
  RunStatus,
} from '@legaladvisor/shared';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';

export type SourceHealthPatch = {
  healthStatus: SourceOverviewDto['healthStatus'];
  lastCheckedAt: string;
  lastErrorMessage?: string | null;
};

export type InsertEventInput = Omit<RunEventDto, 'occurredAt' | 'sequenceNo'> & { occurredAt?: string };

export type EnsureArtifactContentInput = {
  hashSha256: string;
  contentType: string;
  sizeBytes: number;
  encoding: 'utf-8' | null;
  buffer: Buffer;
  createdAt?: string;
};

export type ArtifactContentRecord = {
  id: string;
  hashSha256: string;
  contentType: string;
  sizeBytes: number;
  encoding: 'utf-8' | null;
};

export type InsertArtifactInput = {
  id: string;
  runId: string;
  workItemId: string | null;
  artifactKind: ArtifactDto['artifactKind'];
  artifactRole: ArtifactDto['artifactRole'];
  contentStatus: ArtifactDto['contentStatus'];
  canonicalDocumentId: string | null;
  canonicalVersionId: string | null;
  fileName: string;
  contentId: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export type CanonicalLawDocumentInput = {
  sourceId: SourceId;
  lawName: string;
  normalizedLawName: string;
  englishName: string | null;
  lawLevel: string | null;
  category: string | null;
  lawUrl: string;
};

export type CanonicalLawVersionInput = {
  lawDocumentId: string;
  sourceId: SourceId;
  lawName: string;
  modifiedDate: string | null;
  effectiveDate: string | null;
  sourceUpdateDate: string | null;
  versionFingerprint: string;
};

export type CanonicalArtifactInput = {
  id: string;
  lawDocumentId: string;
  lawVersionId: string;
  artifactKind: ArtifactDto['artifactKind'];
  artifactRole: ArtifactDto['artifactRole'];
  fileName: string;
  contentId: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

export type LinkedRunArtifactInput = {
  id?: string;
  runId: string;
  workItemId: string | null;
  lawDocumentId: string;
  lawVersionId: string;
  canonicalArtifactId: string;
  contentStatus: Extract<ArtifactContentStatus, 'new' | 'reused'>;
  createdAt?: string;
};

export type CanonicalLawVersionMatch = {
  lawDocumentId: string;
  lawVersionId: string;
  versionFingerprint: string;
  artifacts: ArtifactDto[];
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
}

export interface RunRepository {
  createRun(input: CreateRunRequestDto): Promise<string>;
  listRunSummaries(): Promise<RunSummaryDto[]>;
  getRunDetail(runId: string): Promise<RunDetailDto | null>;
  getRunSummary(runId: string): Promise<RunSummaryDto | null>;
  getRunStatus(runId: string): Promise<RunStatus | null>;
  deleteRun(runId: string): Promise<void>;
  setRunStatus(runId: string, status: RunStatus, summary?: string): Promise<void>;
  updateWorkItem(workItemId: string, patch: WorkItemPatch): Promise<void>;
  resetFailedRunItems(runId: string): Promise<void>;
  recomputeRunStats(runId: string): Promise<void>;
}

export interface ArtifactRepository {
  ensureArtifactContent(input: EnsureArtifactContentInput): Promise<ArtifactContentRecord>;
  insertArtifact(input: InsertArtifactInput): Promise<ArtifactDto>;
  getArtifact(artifactId: string): Promise<ArtifactDto | null>;
  listRunArtifacts(runId: string): Promise<ArtifactDto[]>;
  getArtifactContent(artifactId: string): Promise<Buffer | null>;
  ensureCanonicalLawDocument(input: CanonicalLawDocumentInput): Promise<string>;
  findCanonicalLawVersion(sourceId: SourceId, normalizedLawName: string, versionFingerprint: string): Promise<CanonicalLawVersionMatch | null>;
  createCanonicalLawVersion(input: CanonicalLawVersionInput): Promise<string>;
  insertCanonicalArtifact(input: CanonicalArtifactInput): Promise<ArtifactDto>;
  linkRunArtifact(input: LinkedRunArtifactInput): Promise<ArtifactDto>;
}

export interface EventRepository {
  appendEvent(input: InsertEventInput): Promise<RunEventDto>;
  listRunEvents(runId: string, options?: { afterSequenceNo?: number; limit?: number }): Promise<RunEventDto[]>;
  listRunTimelineEntries(runId: string, options?: { afterSequenceNo?: number; limit?: number }): Promise<RunTimelineEntryDto[]>;
}
