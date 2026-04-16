import { z } from 'zod';
import {
  artifactKinds,
  artifactPreviewKinds,
  eventLevels,
  eventTypes,
  rateLimitStatuses,
  sourceHealthStatuses,
  sourceIds,
  targetKinds,
  taskStatuses,
  workItemStatuses,
} from './domain.js';

export const sourceIdSchema = z.enum(sourceIds);
export const sourceHealthStatusSchema = z.enum(sourceHealthStatuses);
export const rateLimitStatusSchema = z.enum(rateLimitStatuses);
export const taskStatusSchema = z.enum(taskStatuses);
export const workItemStatusSchema = z.enum(workItemStatuses);
export const artifactKindSchema = z.enum(artifactKinds);
export const artifactPreviewKindSchema = z.enum(artifactPreviewKinds);
export const eventLevelSchema = z.enum(eventLevels);
export const eventTypeSchema = z.enum(eventTypes);
export const targetKindSchema = z.enum(targetKinds);

const crawlArtifactSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  workItemId: z.string().nullable(),
  artifactKind: artifactKindSchema,
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
  schemaVersion: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
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

export const taskTargetConfigSchema = z.discriminatedUnion('kind', [
  lawTargetConfigSchema,
  judicialListTargetConfigSchema,
  judgmentDatasetTargetConfigSchema,
]);

export const createTaskRequestSchema = z.object({
  sourceId: sourceIdSchema,
  targets: z.array(taskTargetConfigSchema).min(1).max(20),
});

export const taskControlResponseSchema = z.object({
  taskId: z.string().min(1),
  status: taskStatusSchema,
});

export const artifactPreviewPayloadSchema = z.object({
  artifact: crawlArtifactSchema,
  previewKind: artifactPreviewKindSchema,
  content: z.string().nullable(),
  encoding: z.enum(['utf-8']).nullable(),
  truncated: z.boolean(),
  byteLength: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative().nullable(),
});

export const eventStreamPayloadSchema = z.object({
  kind: z.enum(['heartbeat', 'task-updated', 'task-created', 'source-updated']),
  taskId: z.string().optional(),
  sourceId: sourceIdSchema.optional(),
  occurredAt: z.string(),
});
