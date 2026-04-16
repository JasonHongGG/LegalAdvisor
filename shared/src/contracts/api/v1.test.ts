import { describe, expect, it } from 'vitest';
import { artifactDtoSchema, createTaskRequestSchema, taskStreamEventSchema } from '../../schemas/api/v1.js';

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

  it('accepts an artifact payload with canonical reuse metadata', () => {
    const result = artifactDtoSchema.safeParse({
      id: 'artifact-ref-1',
      taskId: 'task-1',
      workItemId: 'work-item-1',
      artifactKind: 'law_article_snapshot',
      artifactRole: 'machine-source',
      contentStatus: 'reused',
      canonicalDocumentId: 'law-doc-1',
      canonicalVersionId: 'law-ver-1',
      fileName: 'civil-code-articles.json',
      contentType: 'application/json; charset=utf-8',
      sizeBytes: 512,
      hashSha256: 'abc123',
      schemaVersion: '1.0.0',
      metadata: {
        lawName: '民法',
      },
      createdAt: '2026-04-16T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});