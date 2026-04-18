import { describe, expect, it } from 'vitest';
import { getSourceFormFieldDefaultValue, validateSourceFormValues } from '../../forms/sourceForm.js';
import { artifactDtoSchema, createRunRequestSchema, runExecutionViewDtoSchema, runStreamEventSchema } from '../../schemas/api/v1.js';

describe('shared API contracts', () => {
  it('accepts a valid create run payload', () => {
    const result = createRunRequestSchema.safeParse({
      sourceId: 'moj-laws',
      fieldValues: { label: '民法', query: '民法', exactMatch: true },
    });

    expect(result.success).toBe(true);
  });

  it('validates source form fields with field-level messages', () => {
    const result = validateSourceFormValues(
      [
        {
          name: 'startUrl',
          label: '起始列表網址',
          type: 'url',
          required: true,
          validation: { url: true },
        },
      ],
      { startUrl: 'not-a-url' },
    );

    expect(result.fieldErrors).toEqual([{ field: 'startUrl', message: '起始列表網址 不是合法網址' }]);
  });

  it('uses declarative source field defaults', () => {
    expect(
      getSourceFormFieldDefaultValue({
        name: 'exactMatch',
        label: '精準比對名稱',
        type: 'checkbox',
        required: false,
      }),
    ).toBe(false);
  });

  it('rejects an invalid run stream event payload', () => {
    const result = runStreamEventSchema.safeParse({ kind: 'source-updated', occurredAt: '2026-04-16T00:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('accepts an artifact payload with canonical reuse metadata', () => {
    const result = artifactDtoSchema.safeParse({
      id: 'artifact-ref-1',
      runId: 'run-1',
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

  it('accepts a run execution projection payload', () => {
    const result = runExecutionViewDtoSchema.safeParse({
      run: {
        id: 'run-1',
        sourceId: 'moj-laws',
        sourceName: '法務部全國法規資料庫',
        status: 'running',
        summary: '工作器執行中',
        overallProgress: 50,
        targetCount: 1,
        totalWorkItems: 1,
        completedWorkItems: 0,
        failedWorkItems: 0,
        queuedWorkItems: 0,
        runningWorkItems: 1,
        warningCount: 0,
        errorCount: 0,
        startedAt: '2026-04-16T00:00:00.000Z',
        finishedAt: null,
        updatedAt: '2026-04-16T00:01:00.000Z',
        lastEventAt: '2026-04-16T00:01:00.000Z',
        etaSeconds: null,
        targets: [{
          id: 'target-1',
          runId: 'run-1',
          targetKind: 'law',
          label: '民法',
          config: { kind: 'law', label: '民法', query: '民法', exactMatch: true },
          createdAt: '2026-04-16T00:00:00.000Z',
        }],
      },
      steps: [{
        id: 'evt-1',
        runId: 'run-1',
        workItemId: null,
        sequenceNo: 1,
        eventType: 'run-status',
        level: 'info',
        title: '工作器開始執行任務。',
        context: '主任務',
        stateLabel: '進行中',
        stateTone: 'running',
        occurredAt: '2026-04-16T00:00:00.000Z',
        endedAt: null,
      }],
      systemEvents: [{
        id: 'evt-1',
        runId: 'run-1',
        workItemId: null,
        sequenceNo: 1,
        eventType: 'run-status',
        level: 'info',
        message: '工作器開始執行任務。',
        details: { status: 'running' },
        occurredAt: '2026-04-16T00:00:00.000Z',
      }],
      artifacts: [],
    });

    expect(result.success).toBe(true);
  });
});