import { startTransition, useEffect } from 'react';
import { api } from '../../../lib/api';

type UseRunStreamOptions = {
  activeRunId: string | null;
  onRefreshRuns: () => Promise<void>;
  onRefreshSources: () => Promise<void>;
  onRefreshRunView: (runId: string) => Promise<void>;
};

export function useRunStream({ activeRunId, onRefreshRuns, onRefreshSources, onRefreshRunView }: UseRunStreamOptions) {
  useEffect(() => {
    const eventSource = api.createRunStream();
    eventSource.onmessage = (event) => {
      const payload = api.parseRunStreamEvent(event.data);
      if (payload.kind === 'heartbeat') {
        return;
      }

      startTransition(() => {
        if (payload.kind === 'source-updated') {
          void onRefreshSources();
          return;
        }

        if (payload.kind === 'run-created' || payload.kind === 'run-removed' || payload.kind === 'run-overview-updated') {
          void onRefreshRuns();
          return;
        }

        if (payload.kind === 'run-view-updated' && payload.runId === activeRunId) {
          void onRefreshRunView(payload.runId);
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [activeRunId, onRefreshRunView, onRefreshRuns, onRefreshSources]);
}