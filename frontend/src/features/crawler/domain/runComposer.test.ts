import { describe, expect, it } from 'vitest';
import { buildInitialFormValues } from './runComposer';

describe('runComposer domain helpers', () => {
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
      recommendedConcurrency: 1,
      lastCheckedAt: null,
      lastErrorMessage: null,
      capabilities: [],
      runBuilderFields: [
        { name: 'label', label: 'Label', type: 'text', required: true },
        { name: 'exactMatch', label: 'Exact', type: 'checkbox', required: false, defaultValue: false },
      ],
    });

    expect(values).toEqual({ label: '', exactMatch: false });
  });
});