import type { SourceId, SourceOverviewDto, TaskTargetConfig } from '@legaladvisor/shared';
import type { FieldValue } from './types';

export function buildInitialFormValues(source: SourceOverviewDto | null) {
  if (!source) {
    return {} as Record<string, FieldValue>;
  }

  return Object.fromEntries(
    source.taskBuilderFields.map((field) => [field.name, field.type === 'checkbox' ? false : '']),
  );
}

export function buildTaskTarget(sourceId: SourceId, values: Record<string, FieldValue>): TaskTargetConfig {
  if (sourceId === 'moj-laws') {
    return {
      kind: 'law',
      label: String(values.label || values.query || '未命名法規任務'),
      query: String(values.query || ''),
      exactMatch: Boolean(values.exactMatch),
    };
  }

  if (sourceId === 'judicial-sites') {
    return {
      kind: 'judicial-list',
      label: String(values.label || '司法院補充資料'),
      startUrl: String(values.startUrl || ''),
      maxPages: Number(values.maxPages || 1),
    };
  }

  return {
    kind: 'judgment-dataset',
    label: String(values.label || '裁判資料集'),
    fileSetId: Number(values.fileSetId || 0),
    top: values.top ? Number(values.top) : undefined,
    skip: values.skip ? Number(values.skip) : undefined,
  };
}