import type { SourceId } from '../api/v1.js';

export type RunStreamEvent =
  | { kind: 'heartbeat'; occurredAt: string }
  | { kind: 'run-created'; runId: string; occurredAt: string }
  | { kind: 'run-removed'; runId: string; occurredAt: string }
  | { kind: 'run-overview-updated'; runId: string; occurredAt: string }
  | { kind: 'run-view-updated'; runId: string; occurredAt: string }
  | { kind: 'source-updated'; sourceId: SourceId; occurredAt: string };