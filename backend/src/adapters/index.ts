import type { SourceId } from '@legaladvisor/shared';
import type { SourceAdapter } from './base.js';
import { MojLawAdapter } from './mojLawAdapter.js';
import { JudicialSiteAdapter } from './judicialSiteAdapter.js';
import { JudgmentDatasetAdapter } from './judgmentDatasetAdapter.js';

const adapters: Record<SourceId, SourceAdapter> = {
  'moj-laws': new MojLawAdapter(),
  'judicial-sites': new JudicialSiteAdapter(),
  'judicial-judgments': new JudgmentDatasetAdapter(),
};

export function getAdapter(sourceId: SourceId) {
  return adapters[sourceId];
}
