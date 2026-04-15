import PgBoss from 'pg-boss';
import type { QueueServicePort } from '../contracts/runtime.js';
import type { AppConfig } from '../config.js';

export class QueueService implements QueueServicePort {
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

  async start(handler: (taskId: string) => Promise<void>) {
    if (this.started) {
      return;
    }
    await this.boss.start();
    await this.boss.work('crawl-task', async (jobs) => {
      for (const job of jobs) {
        const data = job.data as { taskId?: string };
        if (!data.taskId) {
          continue;
        }
        await handler(data.taskId);
      }
    });
    this.started = true;
  }

  async enqueueTask(taskId: string) {
    await this.boss.send('crawl-task', { taskId });
  }

  async stop() {
    if (!this.started) {
      return;
    }
    await this.boss.stop();
    this.started = false;
  }
}
