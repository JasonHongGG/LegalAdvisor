import { useCallback, useEffect, useMemo, useState } from 'react';
import { validateSourceFormValues } from '@legaladvisor/shared';
import type { CreateRunRequestDto, SourceId, SourceOverviewDto } from '@legaladvisor/shared';
import { getApiFieldErrors } from '../../../lib/api';
import { buildInitialFormValues } from '../domain/runComposer';
import type { FieldValue } from '../domain/types';

type UseCrawlerCreateRunFormOptions = {
  sources: SourceOverviewDto[];
  onSubmitCreateRun: (request: CreateRunRequestDto) => Promise<void>;
  onSubmitError?: (error: unknown) => void;
};

export function useCrawlerCreateRunForm({ sources, onSubmitCreateRun, onSubmitError }: UseCrawlerCreateRunFormOptions) {
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  useEffect(() => {
    setSelectedSourceId((current) => {
      if (current && sources.some((source) => source.id === current)) {
        return current;
      }

      return sources[0]?.id ?? null;
    });
  }, [sources]);

  useEffect(() => {
    setFormValues(buildInitialFormValues(selectedSource));
    setFieldErrors({});
  }, [selectedSource]);

  const updateFormValue = useCallback((name: string, value: FieldValue) => {
    setFormValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!(name in current)) {
        return current;
      }

      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  const handleCreateRun = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSourceId || !selectedSource) {
      return;
    }

    const validation = validateSourceFormValues(selectedSource.runBuilderFields, formValues);
    if (validation.fieldErrors.length > 0) {
      setFieldErrors(Object.fromEntries(validation.fieldErrors.map((entry) => [entry.field, entry.message])));
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});

    try {
      await onSubmitCreateRun({
        sourceId: selectedSourceId,
        fieldValues: validation.normalizedValues,
      });
      setFormValues(buildInitialFormValues(selectedSource));
    } catch (error) {
      const nextFieldErrors = getApiFieldErrors(error);
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
      }
      onSubmitError?.(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [formValues, onSubmitCreateRun, onSubmitError, selectedSource, selectedSourceId]);

  return {
    selectedSourceId,
    selectedSource,
    selectSource: setSelectedSourceId,
    formValues,
    fieldErrors,
    isSubmitting,
    updateFormValue,
    handleCreateRun,
  };
}
