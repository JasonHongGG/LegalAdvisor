import { useCallback, useEffect, useState } from 'react';
import type { RunSummaryDto } from '@legaladvisor/shared';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api';

const AUTO_RUN_SYNC_MS = 15_000;

export function useRunList() {
  const navigate = useNavigate();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const [runs, setRuns] = useState<RunSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRuns = useCallback(async () => {
    const nextRuns = await api.listRuns();
    setRuns(nextRuns);

    if (nextRuns.length === 0) {
      if (routeRunId) navigate('/scraping', { replace: true });
      return;
    }

    if (!routeRunId) {
      navigate(`/scraping/${nextRuns[0].id}`, { replace: true });
      return;
    }

    if (!nextRuns.some((run) => run.id === routeRunId)) {
      navigate(`/scraping/${nextRuns[0].id}`, { replace: true });
    }
  }, [navigate, routeRunId]);

  const selectRun = useCallback((runId: string) => {
    navigate(`/scraping/${runId}`);
  }, [navigate]);

  const removeRun = useCallback((runId: string) => {
    setRuns((current) => current.filter((run) => run.id !== runId));
  }, []);

  const upsertRun = useCallback((run: RunSummaryDto) => {
    setRuns((current) => [run, ...current.filter((r) => r.id !== run.id)]);
  }, []);

  const patchRun = useCallback((nextRun: RunSummaryDto) => {
    setRuns((current) => current.map((run) => (run.id === nextRun.id ? nextRun : run)));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshRuns();
    }, AUTO_RUN_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [refreshRuns]);

  return {
    runs,
    activeRunId: routeRunId ?? null,
    isLoading,
    setIsLoading,
    refreshRuns,
    selectRun,
    removeRun,
    upsertRun,
    patchRun,
    navigate,
  };
}
