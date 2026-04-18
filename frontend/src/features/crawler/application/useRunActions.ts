import { useCallback, useState } from 'react';
import { api } from '../../../lib/api';

export function useRunActions(opts: {
  onRefreshRuns: () => Promise<void>;
  onRefreshRunView: (runId: string, force: boolean) => Promise<void>;
  onRemoveRun: (runId: string) => void;
  onRemoveRunView: (runId: string) => void;
  onResetPreview: () => void;
}) {
  const { onRefreshRuns, onRefreshRunView, onRemoveRun, onRemoveRunView, onResetPreview } = opts;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRunAction = useCallback(async (runId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    setErrorMessage(null);
    try {
      if (action === 'pause') await api.pauseRun(runId);
      else if (action === 'resume') await api.resumeRun(runId);
      else if (action === 'cancel') await api.cancelRun(runId);
      else await api.retryFailedRunItems(runId);
      await Promise.all([onRefreshRuns(), onRefreshRunView(runId, true)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '任務操作失敗');
    }
  }, [onRefreshRuns, onRefreshRunView]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    setErrorMessage(null);
    try {
      await api.deleteRun(runId);
      onRemoveRunView(runId);
      onRemoveRun(runId);
      onResetPreview();
      await onRefreshRuns();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '刪除任務失敗');
    }
  }, [onRefreshRuns, onRemoveRun, onRemoveRunView, onResetPreview]);

  return { actionErrorMessage: errorMessage, setActionErrorMessage: setErrorMessage, handleRunAction, handleDeleteRun };
}
