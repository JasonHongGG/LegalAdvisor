import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateRunRequestDto, RunExecutionViewDto, RunSummaryDto, SourceId, SourceOverviewDto } from '@legaladvisor/shared';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useArtifactPreview } from './useArtifactPreview';
import { useRunStream } from './useRunStream';
import { buildInitialFormValues, buildRunTarget } from '../domain/runComposer';
import { buildExecutionTimeline } from '../domain/timeline';
import type { FieldValue } from '../domain/types';

const AUTO_RUN_SYNC_MS = 15_000;
const AUTO_SOURCE_SYNC_MS = 60_000;

export function useCrawlerDashboardController() {
  const navigate = useNavigate();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const artifactPreview = useArtifactPreview();
  const { resetPreview } = artifactPreview;

  const [sources, setSources] = useState<SourceOverviewDto[]>([]);
  const [runs, setRuns] = useState<RunSummaryDto[]>([]);
  const [runViews, setRunViews] = useState<Record<string, RunExecutionViewDto>>({});
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const runViewsRef = useRef<Record<string, RunExecutionViewDto>>({});

  useEffect(() => {
    runViewsRef.current = runViews;
  }, [runViews]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.id === routeRunId) ?? null,
    [routeRunId, runs],
  );

  const activeRunView = useMemo(
    () => (activeRun ? runViews[activeRun.id] ?? null : null),
    [activeRun, runViews],
  );

  const activeRunTimelineEntries = useMemo(
    () => activeRunView?.timeline ?? [],
    [activeRunView],
  );

  const activeRunArtifacts = useMemo(
    () => activeRunView?.artifacts ?? null,
    [activeRunView],
  );

  const activeRunEvents = useMemo(
    () => activeRunView?.events ?? null,
    [activeRunView],
  );

  const isRunViewLoading = useMemo(
    () => Boolean(activeRun && !activeRunView),
    [activeRun, activeRunView],
  );

  const activeErrorMessage = useMemo(() => {
    if (!activeRun) {
      return null;
    }

    const failedTimelineEntry = [...activeRunTimelineEntries].reverse().find((entry) => entry.stateTone === 'failed');
    if (failedTimelineEntry?.title) {
      return failedTimelineEntry.title;
    }

    if (['failed', 'partial_success'].includes(activeRun.status) && activeRun.summary) {
      return activeRun.summary;
    }

    return null;
  }, [activeRun, activeRunTimelineEntries]);

  const executionTimeline = useMemo(
    () => buildExecutionTimeline(activeRunTimelineEntries, nowTimestamp),
    [activeRunTimelineEntries, nowTimestamp],
  );

  const syncSources = useCallback(async (includeHealthRefresh = false) => {
    const nextSources = includeHealthRefresh
      ? await api.refreshSources().catch(() => api.listSources())
      : await api.listSources();

    setSources(nextSources);
    setSelectedSourceId((current) => {
      if (current && nextSources.some((source) => source.id === current)) {
        return current;
      }

      return nextSources[0]?.id ?? null;
    });
  }, []);

  const refreshRuns = useCallback(async () => {
    const nextRuns = await api.listRuns();
    setRuns(nextRuns);

    if (nextRuns.length === 0) {
      if (routeRunId) {
        navigate('/scraping', { replace: true });
      }
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
    setRuns((current) => current.map((run) => (run.id === runId ? nextView.run : run)));
    return nextView;
  }, []);

  const refreshRunView = useCallback(async (runId: string, force = false) => {
    await loadRunView(runId, force);
  }, [loadRunView]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await Promise.all([syncSources(true), refreshRuns()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '無法載入頁面資料');
    } finally {
      setIsLoading(false);
    }
  }, [refreshRuns, syncSources]);

  useEffect(() => {
    setFormValues(buildInitialFormValues(selectedSource));
  }, [selectedSource]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    resetPreview();
    if (routeRunId) {
      void refreshRunView(routeRunId);
    }
  }, [refreshRunView, resetPreview, routeRunId]);

  useRunStream({
    activeRunId: routeRunId ?? null,
    onRefreshRuns: refreshRuns,
    onRefreshSources: async () => {
      await syncSources(false);
    },
    onRefreshRunView: async (runId) => {
      await refreshRunView(runId, true);
    },
  });

  useEffect(() => {
    if (!activeRun || activeRun.finishedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeRun]);

  useEffect(() => {
    const runTimer = window.setInterval(() => {
      void refreshRuns();
      if (routeRunId) {
        void refreshRunView(routeRunId, true);
      }
    }, AUTO_RUN_SYNC_MS);

    const sourceTimer = window.setInterval(() => {
      void syncSources(true).catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '來源同步失敗');
      });
    }, AUTO_SOURCE_SYNC_MS);

    return () => {
      window.clearInterval(runTimer);
      window.clearInterval(sourceTimer);
    };
  }, [refreshRunView, refreshRuns, routeRunId, syncSources]);

  const handleCreateRun = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSourceId) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const request: CreateRunRequestDto = {
        sourceId: selectedSourceId,
        targets: [buildRunTarget(selectedSourceId, formValues)],
      };
      const createdRun = await api.createRun(request);
      setRuns((current) => [createdRun, ...current.filter((run) => run.id !== createdRun.id)]);
      navigate(`/scraping/${createdRun.id}`);
      await refreshRunView(createdRun.id, true);
      setFormValues(buildInitialFormValues(selectedSource));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '建立任務失敗');
    } finally {
      setIsSubmitting(false);
    }
  }, [formValues, navigate, refreshRunView, selectedSource, selectedSourceId]);

  const handleRunAction = useCallback(async (runId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    setErrorMessage(null);

    try {
      if (action === 'pause') {
        await api.pauseRun(runId);
      } else if (action === 'resume') {
        await api.resumeRun(runId);
      } else if (action === 'cancel') {
        await api.cancelRun(runId);
      } else {
        await api.retryFailedRunItems(runId);
      }

      await Promise.all([refreshRuns(), refreshRunView(runId, true)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任務操作失敗');
    }
  }, [refreshRunView, refreshRuns]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    setErrorMessage(null);

    try {
      await api.deleteRun(runId);
      setRunViews((current) => {
        const next = { ...current };
        delete next[runId];
        runViewsRef.current = next;
        return next;
      });
      setRuns((current) => current.filter((run) => run.id !== runId));
      resetPreview();
      await refreshRuns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刪除任務失敗');
    }
  }, [refreshRuns, resetPreview]);

  const updateFormValue = useCallback((name: string, value: FieldValue) => {
    setFormValues((current) => ({ ...current, [name]: value }));
  }, []);

  const selectRun = useCallback((runId: string) => {
    navigate(`/scraping/${runId}`);
    void refreshRunView(runId);
  }, [navigate, refreshRunView]);

  return {
    isLoading,
    isSubmitting,
    errorMessage,
    sources,
    selectedSource,
    selectedSourceId,
    selectSource: setSelectedSourceId,
    formValues,
    updateFormValue,
    handleCreateRun,
    runs,
    activeRunId: routeRunId ?? null,
    activeRun,
    activeRunArtifacts,
    activeRunEvents,
    isRunViewLoading,
    activeErrorMessage,
    executionTimeline,
    nowTimestamp,
    selectRun,
    handleRunAction,
    handleDeleteRun,
    artifactPreview,
  };
}
