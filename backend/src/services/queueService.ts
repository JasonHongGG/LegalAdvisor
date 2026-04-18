import PgBoss from 'pg-boss';
import type { RunQueuePort } from '../application/ports/runtime.js';
import type { AppConfig } from '../config.js';

const RUN_QUEUE_NAME = 'crawl-run';

export class QueueService implements RunQueuePort {
  private readonly boss: PgBoss;
  private started = false;

  constructor(config: AppConfig) {
    if (!config.supabaseDbUrl) {
      throw new Error('SUPABASE_DB_URL is required for the database-backed queue runtime.');
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
    await this.boss.createQueue(RUN_QUEUE_NAME);
    await this.boss.work(RUN_QUEUE_NAME, async (jobs) => {
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
    const jobId = await this.boss.send(RUN_QUEUE_NAME, { runId });
    if (!jobId) {
      throw new Error(`Queue enqueue returned no job id for run ${runId}`);
    }
  }

  async stop() {
    if (!this.started) {
      return;
    }
    await this.boss.stop();
    this.started = false;
  }
}
