import { z } from 'zod';
import {
  artifactContentStatuses,
  artifactKinds,
  artifactPreviewKinds,
  artifactRoles,
  eventLevels,
  eventTypes,
  runStatuses,
  sourceHealthStatuses,
  sourceIds,
  targetKinds,
  timelineStateTones,
  workItemStatuses,
} from '../../contracts/api/v1.js';
import type { RunStreamEvent } from '../../contracts/events/v1.js';

export const sourceIdSchema = z.enum(sourceIds);
export const sourceHealthStatusSchema = z.enum(sourceHealthStatuses);
export const runStatusSchema = z.enum(runStatuses);
export const workItemStatusSchema = z.enum(workItemStatuses);
export const artifactKindSchema = z.enum(artifactKinds);
export const artifactRoleSchema = z.enum(artifactRoles);
export const artifactContentStatusSchema = z.enum(artifactContentStatuses);
export const artifactPreviewKindSchema = z.enum(artifactPreviewKinds);
export const eventLevelSchema = z.enum(eventLevels);
export const eventTypeSchema = z.enum(eventTypes);
export const timelineStateToneSchema = z.enum(timelineStateTones);
export const targetKindSchema = z.enum(targetKinds);

export const sourceFormFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'url', 'checkbox']),
  required: z.boolean(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
});

export const lawTargetConfigSchema = z.object({
  kind: z.literal('law'),
  label: z.string().min(1),
  query: z.string().min(1),
  exactMatch: z.boolean().default(false),
});

export const judicialListTargetConfigSchema = z.object({
  kind: z.literal('judicial-list'),
  label: z.string().min(1),
  startUrl: z.string().url(),
  maxPages: z.number().int().min(1).max(50).default(5),
});

export const judgmentDatasetTargetConfigSchema = z.object({
  kind: z.literal('judgment-dataset'),
  label: z.string().min(1),
  fileSetId: z.number().int().positive(),
  top: z.number().int().positive().max(1000).optional(),
  skip: z.number().int().min(0).optional(),
});

export const runTargetConfigSchema = z.discriminatedUnion('kind', [
  lawTargetConfigSchema,
  judicialListTargetConfigSchema,
  judgmentDatasetTargetConfigSchema,
]);

export const createRunRequestSchema = z.object({
  sourceId: sourceIdSchema,
  targets: z.array(runTargetConfigSchema).min(1).max(20),
});

export const runControlResponseSchema = z.object({
  runId: z.string().min(1),
  status: runStatusSchema,
});

export const artifactDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  workItemId: z.string().nullable(),
  artifactKind: artifactKindSchema,
  artifactRole: artifactRoleSchema,
  contentStatus: artifactContentStatusSchema,
  canonicalDocumentId: z.string().nullable(),
  canonicalVersionId: z.string().nullable(),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
  schemaVersion: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
});

export const artifactPreviewDtoSchema = z.object({
  artifact: artifactDtoSchema,
  previewKind: artifactPreviewKindSchema,
  content: z.string().nullable(),
  encoding: z.enum(['utf-8']).nullable(),
  truncated: z.boolean(),
  byteLength: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative().nullable(),
});

export const runEventDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  workItemId: z.string().nullable(),
  sequenceNo: z.number().int().nonnegative(),
  eventType: eventTypeSchema,
  level: eventLevelSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()),
  occurredAt: z.string().min(1),
});

export const runTimelineEntryDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  workItemId: z.string().nullable(),
  sequenceNo: z.number().int().nonnegative(),
  eventType: eventTypeSchema,
  level: eventLevelSchema,
  title: z.string().min(1),
  context: z.string().nullable(),
  stateLabel: z.string().min(1),
  stateTone: timelineStateToneSchema,
  occurredAt: z.string().min(1),
  endedAt: z.string().nullable(),
});

export const runTargetDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  targetKind: targetKindSchema,
  label: z.string().min(1),
  config: runTargetConfigSchema,
  createdAt: z.string().min(1),
});

export const workItemDtoSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  runTargetId: z.string().nullable(),
  sequenceNo: z.number().int().positive(),
  label: z.string().min(1),
  status: workItemStatusSchema,
  progress: z.number().min(0).max(100),
  currentStage: z.string().min(1),
  sourceLocator: z.string().nullable(),
  cursor: z.record(z.string(), z.unknown()).nullable(),
  lastMessage: z.string(),
  retryCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  itemsProcessed: z.number().int().nonnegative(),
  itemsTotal: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  updatedAt: z.string().min(1),
  artifacts: z.array(artifactDtoSchema),
  recentEvents: z.array(runEventDtoSchema),
});

export const runManifestDtoSchema = z.object({
  schemaVersion: z.string().min(1),
  runId: z.string().min(1),
  sourceId: sourceIdSchema,
  sourceName: z.string().min(1),
  generatedAt: z.string().min(1),
  targets: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      targetKind: targetKindSchema,
    }),
  ),
  counts: z.object({
    artifacts: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  artifacts: z.array(
    z.object({
      id: z.string().min(1),
      kind: artifactKindSchema,
      role: artifactRoleSchema,
      contentStatus: artifactContentStatusSchema,
      canonicalDocumentId: z.string().nullable(),
      canonicalVersionId: z.string().nullable(),
      fileName: z.string().min(1),
      hashSha256: z.string().min(1),
    }),
  ),
  failures: z.array(
    z.object({
      workItemId: z.string().min(1),
      label: z.string().min(1),
      message: z.string().min(1),
    }),
  ),
});

export const sourceOverviewDtoSchema = z.object({
  id: sourceIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  sourceType: z.enum(['api', 'site', 'dataset']),
  implementationMode: z.enum(['stable', 'preview']),
  baseUrl: z.string().min(1),
  description: z.string().min(1),
  notes: z.string(),
  healthStatus: sourceHealthStatusSchema,
  recommendedConcurrency: z.number().int().positive(),
  lastCheckedAt: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  capabilities: z.array(z.string()),
  runBuilderFields: z.array(sourceFormFieldSchema),
});

export const runSummaryDtoSchema = z.object({
  id: z.string().min(1),
  sourceId: sourceIdSchema,
  sourceName: z.string().min(1),
  status: runStatusSchema,
  summary: z.string(),
  overallProgress: z.number().min(0).max(100),
  targetCount: z.number().int().nonnegative(),
  totalWorkItems: z.number().int().nonnegative(),
  completedWorkItems: z.number().int().nonnegative(),
  failedWorkItems: z.number().int().nonnegative(),
  queuedWorkItems: z.number().int().nonnegative(),
  runningWorkItems: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  updatedAt: z.string().min(1),
  lastEventAt: z.string().nullable(),
  etaSeconds: z.number().int().nonnegative().nullable(),
  targets: z.array(runTargetDtoSchema),
});

export const runExecutionViewDtoSchema = z.object({
  run: runSummaryDtoSchema,
  timeline: z.array(runTimelineEntryDtoSchema),
  events: z.array(runEventDtoSchema),
  artifacts: z.array(artifactDtoSchema),
});

export const runDetailDtoSchema = runSummaryDtoSchema.extend({
  workItems: z.array(workItemDtoSchema),
  recentEvents: z.array(runEventDtoSchema),
  artifacts: z.array(artifactDtoSchema),
  manifest: runManifestDtoSchema.nullable(),
});

export const runStreamEventSchema = z.union([
  z.object({ kind: z.literal('heartbeat'), occurredAt: z.string().min(1) }),
  z.object({ kind: z.literal('run-created'), runId: z.string().min(1), occurredAt: z.string().min(1) }),
  z.object({ kind: z.literal('run-removed'), runId: z.string().min(1), occurredAt: z.string().min(1) }),
  z.object({ kind: z.literal('run-overview-updated'), runId: z.string().min(1), occurredAt: z.string().min(1) }),
  z.object({ kind: z.literal('run-view-updated'), runId: z.string().min(1), occurredAt: z.string().min(1) }),
  z.object({ kind: z.literal('source-updated'), sourceId: sourceIdSchema, occurredAt: z.string().min(1) }),
]) satisfies z.ZodType<RunStreamEvent>;