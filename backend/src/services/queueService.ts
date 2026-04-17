import PgBoss from 'pg-boss';
import type { RunQueuePort } from '../application/ports/runtime.js';
import type { AppConfig } from '../config.js';

export class QueueService implements RunQueuePort {
  private readonly boss: PgBoss;
  private started = false;

  constructor(config: AppConfig) {
    if (!config.supabaseDbUrl) {
      throw new Error('SUPABASE_DB_URL is required when DATABASE_WRITE_MODE=enabled.');
    }

    this.boss = new PgBoss({
      connectionString: config.supabaseDbUrl,
      schema: config.supabaseQueueSchema,
      ssl: config.supabaseDbUrl.includes('sslmode=disable') ? false : undefined,
    });

    this.boss.on('error', (error) => {
      console.error('Queue service error:', error);
    });
  }

  async start(handler: (runId: string) => Promise<void>) {
    if (this.started) {
      return;
    }
    await this.boss.start();
    await this.boss.work('crawl-run', async (jobs) => {
      for (const job of jobs) {
        const data = job.data as { runId?: string };
        if (!data.runId) {
          continue;
        }
        await handler(data.runId);
      }
    });
    this.started = true;
  }

  async enqueueTask(runId: string) {
    await this.boss.send('crawl-run', { runId });
  }

  async stop() {
    if (!this.started) {
      return;
    }
    await this.boss.stop();
    this.started = false;
  }
}
