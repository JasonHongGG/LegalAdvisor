import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunExecutionViewDto, RunSummaryDto } from '@legaladvisor/shared';
import { api } from '../../../lib/api';

type UseRunViewStoreOptions = {
  onRunSummaryHydrated?: (run: RunSummaryDto) => void;
};

export function useRunViewStore({ onRunSummaryHydrated }: UseRunViewStoreOptions = {}) {
  const [runViews, setRunViews] = useState<Record<string, RunExecutionViewDto>>({});
  const runViewsRef = useRef<Record<string, RunExecutionViewDto>>({});

  useEffect(() => {
    runViewsRef.current = runViews;
  }, [runViews]);

  const loadRunView = useCallback(async (runId: string, force = false) => {
    if (!force && runViewsRef.current[runId]) {
      return runViewsRef.current[runId];
    }

    const nextView = await api.getRunView(runId);
    setRunViews((current) => {
      const next = { ...current, [runId]: nextView };
      runViewsRef.current = next;
      return next;
    });
    onRunSummaryHydrated?.(nextView.run);
    return nextView;
  }, [onRunSummaryHydrated]);

  const removeRunView = useCallback((runId: string) => {
    setRunViews((current) => {
      if (!(runId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[runId];
      runViewsRef.current = next;
      return next;
    });
  }, []);

  return {
    runViews,
    loadRunView,
    removeRunView,
  };
}
