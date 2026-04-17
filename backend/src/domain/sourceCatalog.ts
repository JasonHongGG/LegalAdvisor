import type { SourceFormFieldDto, SourceId } from '@legaladvisor/shared';

export interface SourceCatalogEntry {
  id: SourceId;
  name: string;
  shortName: string;
  sourceType: 'api' | 'site' | 'dataset';
  implementationMode: 'stable' | 'preview';
  baseUrl: string;
  description: string;
  notes: string;
  supportedTargetKinds: string[];
  capabilities: string[];
  runBuilderFields: SourceFormFieldDto[];
  recommendedConcurrency: number;
}