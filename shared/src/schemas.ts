import { z } from 'zod';
import {
  artifactKinds,
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
export const eventLevelSchema = z.enum(eventLevels);
export const eventTypeSchema = z.enum(eventTypes);
export const targetKindSchema = z.enum(targetKinds);

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

export const eventStreamPayloadSchema = z.object({
  kind: z.enum(['heartbeat', 'task-updated', 'task-created', 'source-updated']),
  taskId: z.string().optional(),
  sourceId: sourceIdSchema.optional(),
  occurredAt: z.string(),
});
