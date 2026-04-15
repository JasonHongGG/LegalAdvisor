import process from 'node:process';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { CrawlRepositoryPort, QueueServicePort } from './contracts/runtime.js';
import { CrawlRepository } from './db/crawlRepository.js';
import { InMemoryCrawlRepository } from './db/inMemoryCrawlRepository.js';
import { createPool } from './db/pool.js';
import { EventBus } from './services/eventBus.js';
import { MemoryQueueService } from './services/memoryQueueService.js';
import { QueueService } from './services/queueService.js';
import { SourceHealthService } from './services/sourceHealthService.js';
import { StorageService } from './services/storageService.js';
import { TaskService } from './services/taskService.js';

const config = loadConfig();
const eventBus = new EventBus();
const storageService = new StorageService(config);

function createRuntime(): {
  repository: CrawlRepositoryPort;
  queueService: QueueServicePort;
  closeDatabase: () => Promise<void>;
} {
  if (!config.databaseWritesEnabled) {
    console.log('DATABASE_WRITE_MODE=disabled, using in-memory task state. No database writes will be performed.');
    return {
      repository: new InMemoryCrawlRepository(),
      queueService: new MemoryQueueService(),
      closeDatabase: async () => {},
    };
  }

  const pool = createPool(config);
  return {
    repository: new CrawlRepository(pool, config.supabaseSchema),
    queueService: new QueueService(config),
    closeDatabase: async () => {
      await pool.end();
    },
  };
}

const runtime = createRuntime();
const repository = runtime.repository;
const queueService = runtime.queueService;
const sourceHealthService = new SourceHealthService(repository);
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
    await runtime.closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
