import { useCallback, useEffect, useState } from 'react';
import type { SourceOverviewDto } from '@legaladvisor/shared';
import { api } from '../../../lib/api';

const AUTO_SOURCE_SYNC_MS = 60_000;

export function useSources() {
  const [sources, setSources] = useState<SourceOverviewDto[]>([]);

  const syncSources = useCallback(async (includeHealthRefresh = false) => {
    const nextSources = includeHealthRefresh
      ? await api.refreshSources().catch(() => api.listSources())
      : await api.listSources();
    setSources(nextSources);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void syncSources(true).catch(() => {});
    }, AUTO_SOURCE_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [syncSources]);

  return { sources, syncSources };
}
