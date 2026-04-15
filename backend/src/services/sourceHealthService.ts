import { SOURCE_CATALOG, type SourceId } from '@legaladvisor/shared';
import type { CrawlRepositoryPort } from '../contracts/runtime.js';
import { httpClient } from '../httpClient.js';

export class SourceHealthService {
  constructor(private readonly repository: CrawlRepositoryPort) {}

  async refreshAll() {
    await Promise.all(SOURCE_CATALOG.map((source) => this.refreshSource(source.id)));
  }

  async refreshSource(sourceId: SourceId) {
    const source = SOURCE_CATALOG.find((entry) => entry.id === sourceId);
    if (!source) {
      return;
    }

    try {
      const response = await httpClient.get(source.baseUrl, { insecureTls: true });
      const healthy = response.status >= 200 && response.status < 400;
      await this.repository.updateSourceHealth(source.id, {
        health_status: healthy ? 'healthy' : 'degraded',
        rate_limit_status: 'normal',
        last_checked_at: new Date().toISOString(),
        last_error_message: healthy ? null : `HTTP ${response.status}`,
      });
    } catch (error) {
      await this.repository.updateSourceHealth(source.id, {
        health_status: 'down',
        rate_limit_status: 'unknown',
        last_checked_at: new Date().toISOString(),
        last_error_message: error instanceof Error ? error.message : 'Unknown health check error',
      });
    }
  }
}
