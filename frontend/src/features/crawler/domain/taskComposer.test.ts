import { describe, expect, it } from 'vitest';
import { buildInitialFormValues, buildTaskTarget } from './taskComposer';

describe('taskComposer domain helpers', () => {
  it('builds initial field values from source form definitions', () => {
    const values = buildInitialFormValues({
      id: 'moj-laws',
      name: 'source',
      shortName: 'src',
      sourceType: 'api',
      implementationMode: 'stable',
      baseUrl: 'https://example.com',
      description: 'desc',
      notes: 'notes',
      healthStatus: 'healthy',
      rateLimitStatus: 'normal',
      todayRequestCount: 0,
      recommendedConcurrency: 1,
      lastCheckedAt: null,
      lastErrorMessage: null,
      capabilities: [],
      taskBuilderFields: [
        { name: 'label', label: 'Label', type: 'text', required: true },
        { name: 'exactMatch', label: 'Exact', type: 'checkbox', required: false },
      ],
    });

    expect(values).toEqual({ label: '', exactMatch: false });
  });

  it('builds law target config with sensible fallbacks', () => {
    const target = buildTaskTarget('moj-laws', { query: '民法', exactMatch: true });
    expect(target).toEqual({ kind: 'law', label: '民法', query: '民法', exactMatch: true });
  });
});