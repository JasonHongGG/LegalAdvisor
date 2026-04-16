export const sourceIds = ['moj-laws', 'judicial-sites', 'judicial-judgments'] as const;
export type SourceId = (typeof sourceIds)[number];

export const sourceHealthStatuses = ['unknown', 'healthy', 'degraded', 'down'] as const;
export type SourceHealthStatus = (typeof sourceHealthStatuses)[number];

export const taskStatuses = [
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
export type TaskStatus = (typeof taskStatuses)[number];

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

export const artifactContentStatuses = ['task-only', 'new', 'reused'] as const;
export type ArtifactContentStatus = (typeof artifactContentStatuses)[number];

export const artifactPreviewKinds = ['json', 'markdown', 'text', 'unsupported'] as const;
export type ArtifactPreviewKind = (typeof artifactPreviewKinds)[number];

export const targetKinds = ['law', 'judicial-list', 'judgment-dataset'] as const;
export type TargetKind = (typeof targetKinds)[number];

export const eventLevels = ['info', 'warning', 'error'] as const;
export type EventLevel = (typeof eventLevels)[number];

export const eventTypes = [
  'task-created',
  'task-status',
  'work-item-status',
  'log',
  'artifact-emitted',
] as const;
export type EventType = (typeof eventTypes)[number];

export interface SourceFormFieldDto {
  name: string;
  label: string;
  type: 'text' | 'number' | 'url' | 'checkbox';
  required: boolean;
  placeholder?: string;
  description?: string;
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
  taskBuilderFields: SourceFormFieldDto[];
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

export type TaskTargetConfig = LawTargetConfig | JudicialListTargetConfig | JudgmentDatasetTargetConfig;

export interface TaskTargetDto {
  id: string;
  taskId: string;
  targetKind: TargetKind;
  label: string;
  config: TaskTargetConfig;
  createdAt: string;
}

export interface ArtifactDto {
  id: string;
  taskId: string;
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

export interface TaskEventDto {
  id: string;
  taskId: string;
  workItemId: string | null;
  eventType: EventType;
  level: EventLevel;
  message: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

export interface WorkItemDto {
  id: string;
  taskId: string;
  taskTargetId: string | null;
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
  recentEvents: TaskEventDto[];
}

export interface TaskManifestDto {
  schemaVersion: string;
  taskId: string;
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

export interface TaskSummaryDto {
  id: string;
  sourceId: SourceId;
  sourceName: string;
  status: TaskStatus;
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
  targets: TaskTargetDto[];
}

export interface TaskDetailDto extends TaskSummaryDto {
  workItems: WorkItemDto[];
  recentEvents: TaskEventDto[];
  artifacts: ArtifactDto[];
  manifest: TaskManifestDto | null;
}

export interface CreateTaskRequestDto {
  sourceId: SourceId;
  targets: TaskTargetConfig[];
}

export interface TaskControlResponseDto {
  taskId: string;
  status: TaskStatus;
}