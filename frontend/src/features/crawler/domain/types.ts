export type FieldValue = string | number | boolean;

export type TimelineStep = {
  id: string;
  title: string;
  context: string | null;
  workItemId: string | null;
  sequenceNo: number;
  startedAtLabel: string;
  startedAtMs: number;
  durationLabel: string;
  stateLabel: string;
  stateTone: 'done' | 'running' | 'failed' | 'cancelled';
};

export type ProgressTone = 'success' | 'error' | 'idle' | 'running';