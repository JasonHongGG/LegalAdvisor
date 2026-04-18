import { useCallback, useEffect, useState } from 'react';
import type { CreateRunRequestDto } from '@legaladvisor/shared';
import { api } from '../../../lib/api';
import { useArtifactPreview } from './useArtifactPreview';
import { useCrawlerCreateRunForm } from './useCrawlerCreateRunForm';
import { useSources } from './useSources';
import { useRunList } from './useRunList';
import { useActiveRunView } from './useActiveRunView';
import { useRunActions } from './useRunActions';

export function useCrawlerDashboardController() {
  const { sources, syncSources } = useSources();
  const runList = useRunList();
  const artifactPreview = useArtifactPreview();

  const activeRunView = useActiveRunView({
    runs: runList.runs,
    activeRunId: runList.activeRunId,
    onPatchRun: runList.patchRun,
    onRefreshRuns: runList.refreshRuns,
    onSyncSources: () => syncSources(false),
  });

  const { actionErrorMessage, setActionErrorMessage, handleRunAction, handleDeleteRun } = useRunActions({
    onRefreshRuns: runList.refreshRuns,
    onRefreshRunView: activeRunView.refreshRunView,
    onRemoveRun: runList.removeRun,
    onRemoveRunView: activeRunView.removeRunView,
    onResetPreview: artifactPreview.resetPreview,
  });

  const [initErrorMessage, setInitErrorMessage] = useState<string | null>(null);
  const errorMessage = actionErrorMessage ?? initErrorMessage;

  const submitCreateRun = useCallback(async (request: CreateRunRequestDto) => {
    setInitErrorMessage(null);
    setActionErrorMessage(null);
    const createdRun = await api.createRun(request);
    runList.upsertRun(createdRun);
    runList.navigate(`/scraping/${createdRun.id}`);
    await activeRunView.refreshRunView(createdRun.id, true);
  }, [activeRunView, runList, setActionErrorMessage]);

  const createRunForm = useCrawlerCreateRunForm({
    sources,
    onSubmitCreateRun: submitCreateRun,
    onSubmitError: (error) => {
      setInitErrorMessage(error instanceof Error ? error.message : '建立任務失敗');
    },
  });

  // Initial load
  useEffect(() => {
    const init = async () => {
      runList.setIsLoading(true);
      setInitErrorMessage(null);
      try {
        await Promise.all([syncSources(true), runList.refreshRuns()]);
      } catch (error) {
        setInitErrorMessage(error instanceof Error ? error.message : '無法載入頁面資料');
      } finally {
        runList.setIsLoading(false);
      }
    };
    void init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRun = useCallback((runId: string) => {
    runList.selectRun(runId);
    void activeRunView.refreshRunView(runId);
  }, [runList, activeRunView]);

  return {
    isLoading: runList.isLoading,
    isSubmitting: createRunForm.isSubmitting,
    errorMessage,
    sources,
    selectedSource: createRunForm.selectedSource,
    selectedSourceId: createRunForm.selectedSourceId,
    selectSource: createRunForm.selectSource,
    formValues: createRunForm.formValues,
    fieldErrors: createRunForm.fieldErrors,
    updateFormValue: createRunForm.updateFormValue,
    handleCreateRun: createRunForm.handleCreateRun,
    runs: runList.runs,
    activeRunId: runList.activeRunId,
    activeRun: activeRunView.activeRun,
    activeRunArtifacts: activeRunView.activeRunArtifacts,
    activeRunEvents: activeRunView.activeRunEvents,
    isRunViewLoading: activeRunView.isRunViewLoading,
    activeErrorMessage: activeRunView.activeErrorMessage,
    executionTimeline: activeRunView.executionTimeline,
    nowTimestamp: activeRunView.nowTimestamp,
    selectRun,
    handleRunAction,
    handleDeleteRun,
    artifactPreview,
  };
}
