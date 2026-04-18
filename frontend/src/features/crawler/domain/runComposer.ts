import { getSourceFormFieldDefaultValue } from '@legaladvisor/shared';
import type { SourceOverviewDto } from '@legaladvisor/shared';
import type { FieldValue } from './types';

export function buildInitialFormValues(source: SourceOverviewDto | null) {
  if (!source) {
    return {} as Record<string, FieldValue>;
  }

  return Object.fromEntries(
    source.runBuilderFields.map((field) => [field.name, getSourceFormFieldDefaultValue(field)]),
  );
}
