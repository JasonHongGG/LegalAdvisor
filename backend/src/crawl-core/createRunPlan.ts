import type { CreateRunRequestDto, RunTargetConfig, SourceOverviewDto } from '@legaladvisor/shared';
import { validateSourceFormValues } from '@legaladvisor/shared';
import type { SourceAdapterResolver } from '../adapters/base.js';
import { RequestValidationError } from '../domain/errors.js';

export type CreateRunPlan = {
  sourceId: CreateRunRequestDto['sourceId'];
  targets: RunTargetConfig[];
  normalizedFields: Record<string, string | number | boolean | null>;
};

export function buildCreateRunPlan(
  source: SourceOverviewDto,
  request: CreateRunRequestDto,
  adapterResolver: SourceAdapterResolver,
): CreateRunPlan {
  const { normalizedValues, fieldErrors } = validateSourceFormValues(source.runBuilderFields, request.fieldValues);
  if (fieldErrors.length > 0) {
    throw new RequestValidationError('建立任務表單驗證失敗', { fieldErrors });
  }

  const adapter = adapterResolver.get(source.id);
  return {
    sourceId: request.sourceId,
    normalizedFields: normalizedValues,
    targets: adapter.buildTargets(normalizedValues),
  };
}
