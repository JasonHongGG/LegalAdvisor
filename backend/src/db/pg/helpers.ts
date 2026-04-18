import type { EventType } from '@legaladvisor/shared';

export function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return fallback;
}

export function toIsoString(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function normalizeEventType(value: unknown): EventType {
  if (value === 'run-created') return 'run-created';
  if (value === 'run-status') return 'run-status';
  return value as EventType;
}

export class PgBase {
  constructor(
    protected readonly db: import('pg').Pool,
    protected readonly schema: string,
  ) {}

  protected table(name: string) {
    return `${this.schema}.${name}`;
  }

  protected async getClient() {
    return this.db.connect();
  }
}
