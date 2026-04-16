import { describe, expect, it } from 'vitest';
import { createTaskRequestSchema, taskStreamEventSchema } from '../../schemas/api/v1.js';

describe('shared API contracts', () => {
  it('accepts a valid create task payload', () => {
    const result = createTaskRequestSchema.safeParse({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: true }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid task stream event payload', () => {
    const result = taskStreamEventSchema.safeParse({ kind: 'source-updated', occurredAt: '2026-04-16T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });
});