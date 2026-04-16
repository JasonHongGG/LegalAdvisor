import type { SourceId } from '../api/v1.js';

export type TaskStreamEvent =
  | { kind: 'heartbeat'; occurredAt: string }
  | { kind: 'task-created'; taskId: string; occurredAt: string }
  | { kind: 'task-updated'; taskId: string; occurredAt: string }
  | { kind: 'source-updated'; sourceId: SourceId; occurredAt: string };