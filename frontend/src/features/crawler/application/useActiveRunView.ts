import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RunSummaryDto } from '@legaladvisor/shared';
import { useRunViewStore } from './useRunViewStore';
import { useRunStream } from './useRunStream';
import { buildExecutionTimeline } from '../domain/timeline';

export function useActiveRunView(opts: {
  runs: RunSummaryDto[];
  activeRunId: string | null;
  onPatchRun: (run: RunSummaryDto) => void;
  onRefreshRuns: () => Promise<void>;
  onSyncSources: () => Promise<void>;
}) {
  const { runs, activeRunId, onPatchRun, onRefreshRuns, onSyncSources } = opts;
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  const { runViews, loadRunView: loadCachedRunView, removeRunView } = useRunViewStore({
    onRunSummaryHydrated: onPatchRun,
  });

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? null,
    [activeRunId, runs],
  );

  const activeRunView = useMemo(
    () => (activeRun ? runViews[activeRun.id] ?? null : null),
    [activeRun, runViews],
  );

  const activeRunTimelineEntries = useMemo(() => activeRunView?.steps ?? [], [activeRunView]);
  const activeRunArtifacts = useMemo(() => activeRunView?.artifacts ?? null, [activeRunView]);
  const activeRunEvents = useMemo(() => activeRunView?.systemEvents ?? null, [activeRunView]);
  const isRunViewLoading = useMemo(() => Boolean(activeRun && !activeRunView), [activeRun, activeRunView]);

  const activeErrorMessage = useMemo(() => {
    if (!activeRun) return null;
    const failedEntry = [...activeRunTimelineEntries].reverse().find((e) => e.stateTone === 'failed');
    if (failedEntry?.title) return failedEntry.title;
    if (['failed', 'partial_success'].includes(activeRun.status) && activeRun.summary) return activeRun.summary;
    return null;
  }, [activeRun, activeRunTimelineEntries]);

  const executionTimeline = useMemo(
    () => buildExecutionTimeline(activeRunTimelineEntries, nowTimestamp),
    [activeRunTimelineEntries, nowTimestamp],
  );

  const refreshRunView = useCallback(async (runId: string, force = false) => {
    await loadCachedRunView(runId, force);
  }, [loadCachedRunView]);

  useRunStream({
    activeRunId: activeRunId,
    onRefreshRuns: onRefreshRuns,
    onRefreshSources: () => onSyncSources(),
    onRefreshRunView: (runId) => refreshRunView(runId, true),
  });

  // Live clock for active (unfinished) runs
  useEffect(() => {
    if (!activeRun || activeRun.finishedAt) return undefined;
    const timer = window.setInterval(() => setNowTimestamp(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeRun]);

  // Load run view when active run changes
  useEffect(() => {
    if (activeRunId) void refreshRunView(activeRunId);
  }, [activeRunId, refreshRunView]);

  // Periodic run view refresh
  useEffect(() => {
    if (!activeRunId) return undefined;
    const timer = window.setInterval(() => {
      void onRefreshRuns();
      void refreshRunView(activeRunId, true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeRunId, onRefreshRuns, refreshRunView]);

  return {
    activeRun,
    activeRunArtifacts,
    activeRunEvents,
    activeErrorMessage,
    executionTimeline,
    nowTimestamp,
    isRunViewLoading,
    refreshRunView,
    removeRunView,
  };
}
