import { describe, expect, it } from 'vitest';
import { sourceAdapterRegistry } from './index.js';

describe('Adapter buildTargets', () => {
  it('mojLawAdapter returns a law target config', () => {
    const adapter = sourceAdapterRegistry.get('moj-laws');
    const targets = adapter.buildTargets({ label: '民法', query: '民法', exactMatch: true });
    expect(targets).toEqual([{ kind: 'law', label: '民法', query: '民法', exactMatch: true }]);
  });

  it('judicialSiteAdapter returns a judicial-list target config', () => {
    const adapter = sourceAdapterRegistry.get('judicial-sites');
    const targets = adapter.buildTargets({ label: '判決列表', startUrl: 'https://example.com', maxPages: 5 });
    expect(targets).toEqual([{ kind: 'judicial-list', label: '判決列表', startUrl: 'https://example.com', maxPages: 5 }]);
  });

  it('judgmentDatasetAdapter returns a judgment-dataset target config', () => {
    const adapter = sourceAdapterRegistry.get('judicial-judgments');
    const targets = adapter.buildTargets({ label: '裁判書', fileSetId: 123, top: 100, skip: 0 });
    expect(targets).toEqual([{ kind: 'judgment-dataset', label: '裁判書', fileSetId: 123, top: 100, skip: 0 }]);
  });
});
