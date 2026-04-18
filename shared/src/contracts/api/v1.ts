export const sourceIds = ['moj-laws', 'judicial-sites', 'judicial-judgments'] as const;
export type SourceId = (typeof sourceIds)[number];

export const sourceHealthStatuses = ['unknown', 'healthy', 'degraded', 'down'] as const;
export type SourceHealthStatus = (typeof sourceHealthStatuses)[number];

export const runStatuses = [
  'draft',
  'queued',
  'dispatching',
  'running',
  'paused',
  'completed',
  'partial_success',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof runStatuses)[number];

export const workItemStatuses = [
  'pending',
  'fetching_index',
  'fetching_detail',
  'parsing',
  'normalizing',
  'writing_output',
  'done',
  'skipped',
  'failed',
] as const;
export type WorkItemStatus = (typeof workItemStatuses)[number];

export const artifactKinds = [
  'law_source_snapshot',
  'law_document_snapshot',
  'law_article_snapshot',
  'law_revision_snapshot',
  'judicial_site_snapshot',
  'judicial_site_markdown',
  'judgment_source_snapshot',
  'judgment_document_snapshot',
  'debug_payload',
] as const;
export type ArtifactKind = (typeof artifactKinds)[number];

export const artifactRoles = [
  'machine-source',
  'provenance',
  'version-evidence',
  'review-output',
  'crawler-output',
  'debug',
] as const;
export type ArtifactRole = (typeof artifactRoles)[number];

export const artifactContentStatuses = ['run-only', 'new', 'reused'] as const;
export type ArtifactContentStatus = (typeof artifactContentStatuses)[number];

export const artifactPreviewKinds = ['json', 'markdown', 'text', 'unsupported'] as const;
export type ArtifactPreviewKind = (typeof artifactPreviewKinds)[number];

export const targetKinds = ['law', 'judicial-list', 'judgment-dataset'] as const;
export type TargetKind = (typeof targetKinds)[number];

export const eventLevels = ['info', 'warning', 'error'] as const;
export type EventLevel = (typeof eventLevels)[number];

export const eventTypes = [
  'run-created',
  'run-status',
  'work-item-status',
  'work-item-progress',
  'log',
  'artifact-emitted',
] as const;
export type EventType = (typeof eventTypes)[number];

export const timelineStateTones = ['done', 'running', 'failed', 'cancelled'] as const;
export type TimelineStateTone = (typeof timelineStateTones)[number];

export type SourceFormFieldValue = string | number | boolean | null;

export interface SourceFormFieldValidationDto {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  url?: boolean;
}

export interface FieldErrorDto {
  field: string;
  message: string;
}

export interface ValidationErrorDetailsDto {
  fieldErrors: FieldErrorDto[];
}

export interface SourceFormFieldDto {
  name: string;
  label: string;
  type: 'text' | 'number' | 'url' | 'checkbox';
  required: boolean;
  defaultValue?: SourceFormFieldValue;
  placeholder?: string;
  description?: string;
  validation?: SourceFormFieldValidationDto;
}

export interface SourceOverviewDto {
  id: SourceId;
  name: string;
  shortName: string;
  sourceType: 'api' | 'site' | 'dataset';
  implementationMode: 'stable' | 'preview';
  baseUrl: string;
  description: string;
  notes: string;
  healthStatus: SourceHealthStatus;
  recommendedConcurrency: number;
  lastCheckedAt: string | null;
  lastErrorMessage: string | null;
  capabilities: string[];
  runBuilderFields: SourceFormFieldDto[];
}

export interface LawTargetConfig {
  kind: 'law';
  label: string;
  query: string;
  exactMatch: boolean;
}

export interface JudicialListTargetConfig {
  kind: 'judicial-list';
  label: string;
  startUrl: string;
  maxPages: number;
}

export interface JudgmentDatasetTargetConfig {
  kind: 'judgment-dataset';
  label: string;
  fileSetId: number;
  top?: number;
  skip?: number;
}

export type RunTargetConfig = LawTargetConfig | JudicialListTargetConfig | JudgmentDatasetTargetConfig;

export interface RunTargetDto {
  id: string;
  runId: string;
  targetKind: TargetKind;
  label: string;
  config: RunTargetConfig;
  createdAt: string;
}

export interface ArtifactDto {
  id: string;
  runId: string;
  workItemId: string | null;
  artifactKind: ArtifactKind;
  artifactRole: ArtifactRole;
  contentStatus: ArtifactContentStatus;
  canonicalDocumentId: string | null;
  canonicalVersionId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  schemaVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ArtifactPreviewDto {
  artifact: ArtifactDto;
  previewKind: ArtifactPreviewKind;
  content: string | null;
  encoding: 'utf-8' | null;
  truncated: boolean;
  byteLength: number;
  lineCount: number | null;
}

export interface RunEventDto {
  id: string;
  runId: string;
  workItemId: string | null;
  sequenceNo: number;
  eventType: EventType;
  level: EventLevel;
  message: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export const stageStatuses = ['running', 'completed', 'failed'] as const;
export type StageStatus = (typeof stageStatuses)[number];

export interface WorkItemStageDto {
  id: string;
  runId: string;
  workItemId: string;
  stageName: string;
  status: StageStatus;
  message: string;
  progress: number;
  itemsProcessed: number;
  itemsTotal: number;
  sourceLocator: string | null;
  sequenceNo: number;
  startedAt: string;
  endedAt: string | null;
}

export interface RunStepDto {
  id: string;
  runId: string;
  workItemId: string | null;
  sequenceNo: number;
  eventType: EventType;
  level: EventLevel;
  title: string;
  context: string | null;
  stateLabel: string;
  stateTone: TimelineStateTone;
  occurredAt: string;
  endedAt: string | null;
}

export type RunTimelineEntryDto = RunStepDto;

export interface RunExecutionViewDto {
  run: RunSummaryDto;
  steps: RunStepDto[];
  systemEvents: RunEventDto[];
  artifacts: ArtifactDto[];
}

export interface WorkItemDto {
  id: string;
  runId: string;
  runTargetId: string | null;
  sequenceNo: number;
  label: string;
  status: WorkItemStatus;
  progress: number;
  currentStage: string;
  sourceLocator: string | null;
  cursor: Record<string, unknown> | null;
  lastMessage: string;
  retryCount: number;
  warningCount: number;
  errorCount: number;
  itemsProcessed: number;
  itemsTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  artifacts: ArtifactDto[];
  recentEvents: RunEventDto[];
}

export interface RunManifestDto {
  schemaVersion: string;
  runId: string;
  sourceId: SourceId;
  sourceName: string;
  generatedAt: string;
  targets: Array<{
    id: string;
    label: string;
    targetKind: TargetKind;
  }>;
  counts: {
    artifacts: number;
    success: number;
    failed: number;
    skipped: number;
    warnings: number;
  };
  artifacts: Array<{
    id: string;
    kind: ArtifactKind;
    role: ArtifactRole;
    contentStatus: ArtifactContentStatus;
    canonicalDocumentId: string | null;
    canonicalVersionId: string | null;
    fileName: string;
    hashSha256: string;
  }>;
  failures: Array<{
    workItemId: string;
    label: string;
    message: string;
  }>;
}

export interface RunSummaryDto {
  id: string;
  sourceId: SourceId;
  sourceName: string;
  status: RunStatus;
  summary: string;
  overallProgress: number;
  targetCount: number;
  totalWorkItems: number;
  completedWorkItems: number;
  failedWorkItems: number;
  queuedWorkItems: number;
  runningWorkItems: number;
  warningCount: number;
  errorCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  lastEventAt: string | null;
  etaSeconds: number | null;
  targets: RunTargetDto[];
}

export interface RunDetailDto extends RunSummaryDto {
  workItems: WorkItemDto[];
  recentEvents: RunEventDto[];
  artifacts: ArtifactDto[];
  manifest: RunManifestDto | null;
}

export interface CreateRunRequestDto {
  sourceId: SourceId;
  fieldValues: Record<string, SourceFormFieldValue>;
}

export interface RunControlResponseDto {
  runId: string;
  status: RunStatus;
}

export interface ErrorResponseDto {
  code: string;
  message: string;
  details: Record<string, unknown> | ValidationErrorDetailsDto | null;
}