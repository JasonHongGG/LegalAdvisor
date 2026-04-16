import { httpClient } from '../../httpClient.js';
import type { SourceHealthProbe } from '../../application/ports/runtime.js';

export class HttpSourceHealthProbe implements SourceHealthProbe {
  async probe(source: Parameters<SourceHealthProbe['probe']>[0]): ReturnType<SourceHealthProbe['probe']> {
    try {
      const response = await httpClient.get(source.baseUrl, { insecureTls: true });
      const healthy = response.status >= 200 && response.status < 400;
      return {
        healthStatus: healthy ? ('healthy' as const) : ('degraded' as const),
        rateLimitStatus: 'normal' as const,
        lastErrorMessage: healthy ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        healthStatus: 'down' as const,
        rateLimitStatus: 'unknown' as const,
        lastErrorMessage: error instanceof Error ? error.message : 'Unknown health check error',
      };
    }
  }
}