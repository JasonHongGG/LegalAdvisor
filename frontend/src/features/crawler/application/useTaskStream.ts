import { startTransition, useEffect } from 'react';
import { api } from '../../../lib/api';

type UseTaskStreamOptions = {
  activeTaskId: string | null;
  onRefreshTasks: () => Promise<void>;
  onRefreshSources: () => Promise<void>;
  onRefreshTaskDetail: (taskId: string) => Promise<void>;
};

export function useTaskStream({ activeTaskId, onRefreshTasks, onRefreshSources, onRefreshTaskDetail }: UseTaskStreamOptions) {
  useEffect(() => {
    const eventSource = api.createTaskStream();
    eventSource.onmessage = (event) => {
      const payload = api.parseTaskStreamEvent(event.data);
      if (payload.kind === 'heartbeat') {
        return;
      }

      startTransition(() => {
        void onRefreshTasks();
        if ('taskId' in payload && payload.taskId && payload.taskId === activeTaskId) {
          void onRefreshTaskDetail(payload.taskId);
        }
        if (payload.kind === 'source-updated') {
          void onRefreshSources();
        }
      });
    };

    return () => {
      eventSource.close();
    };
  }, [activeTaskId, onRefreshTaskDetail, onRefreshSources, onRefreshTasks]);
}