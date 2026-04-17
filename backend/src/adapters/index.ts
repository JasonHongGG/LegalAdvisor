import type { SourceId } from '@legaladvisor/shared';
import type { SourceAdapter, SourceAdapterResolver } from './base.js';
import { MojLawAdapter } from './mojLawAdapter.js';
import { JudicialSiteAdapter } from './judicialSiteAdapter.js';
import { JudgmentDatasetAdapter } from './judgmentDatasetAdapter.js';

const adapters: Record<SourceId, SourceAdapter> = {
  'moj-laws': new MojLawAdapter(),
  'judicial-sites': new JudicialSiteAdapter(),
  'judicial-judgments': new JudgmentDatasetAdapter(),
};

export class SourceAdapterRegistry implements SourceAdapterResolver {
  constructor(private readonly entries: Record<SourceId, SourceAdapter>) {}

  get(sourceId: SourceId) {
    return this.entries[sourceId];
  }
}

export const sourceAdapterRegistry = new SourceAdapterRegistry(adapters);

export function getAdapter(sourceId: SourceId) {
  return sourceAdapterRegistry.get(sourceId);
}
