import process from 'node:process';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { CrawlRepository } from './db/crawlRepository.js';
import { createPool } from './db/pool.js';
import { EventBus } from './services/eventBus.js';
import { QueueService } from './services/queueService.js';
import { SourceHealthService } from './services/sourceHealthService.js';
import { StorageService } from './services/storageService.js';
import { TaskService } from './services/taskService.js';

const config = loadConfig();
const pool = createPool(config);
const repository = new CrawlRepository(pool, config.supabaseSchema);
const eventBus = new EventBus();
const queueService = new QueueService(config);
const sourceHealthService = new SourceHealthService(repository);
const storageService = new StorageService(config);
const taskService = new TaskService(repository, storageService, eventBus, queueService, sourceHealthService);

async function main() {
  await taskService.bootstrap();
  await queueService.start((taskId) => taskService.processTask(taskId));

  const app = createApp(taskService, eventBus);
  const server = app.listen(config.port, () => {
    console.log(`LegalAdvisor API listening on http://localhost:${config.port}`);
  });

  const heartbeat = setInterval(() => {
    eventBus.publish({ kind: 'heartbeat', occurredAt: new Date().toISOString() });
  }, 15000);

  const shutdown = async () => {
    clearInterval(heartbeat);
    server.close();
    await queueService.stop();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
