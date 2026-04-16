import process from 'node:process';
import { createApp } from './app.js';
import type {
  ArtifactRepository,
  CheckpointRepository,
  EventRepository,
  SourceRepository,
  TaskRepository,
} from './application/ports/repositories.js';
import type { TaskQueuePort } from './application/ports/runtime.js';
import { TaskExecutionContextFactory } from './application/factories/taskExecutionContextFactory.js';
import { CrawlerApplicationFacade } from './application/services/crawlerApplicationFacade.js';
import { ManifestService } from './application/services/manifestService.js';
import { SourceCatalogService } from './application/services/sourceCatalogService.js';
import { TaskActivityService } from './application/services/taskActivityService.js';
import { TaskCommandService } from './application/services/taskCommandService.js';
import { TaskExecutionService } from './application/services/taskExecutionService.js';
import { TaskQueryService } from './application/services/taskQueryService.js';
import { loadConfig } from './config.js';
import { CrawlRepository } from './db/crawlRepository.js';
import { InMemoryCrawlRepository } from './db/inMemoryCrawlRepository.js';
import { createPool } from './db/pool.js';
import { HttpSourceHealthProbe } from './infrastructure/catalog/httpSourceHealthProbe.js';
import { SseTaskStreamBroadcaster } from './infrastructure/stream/sseTaskStreamBroadcaster.js';
import { MemoryQueueService } from './services/memoryQueueService.js';
import { QueueService } from './services/queueService.js';
import { StorageService } from './services/storageService.js';

const config = loadConfig();
const taskStreamBroadcaster = new SseTaskStreamBroadcaster();
const storageService = new StorageService(config);

function createRuntime(): {
  sourceRepository: SourceRepository;
  taskRepository: TaskRepository;
  artifactRepository: ArtifactRepository;
  eventRepository: EventRepository;
  checkpointRepository: CheckpointRepository;
  taskQueue: TaskQueuePort;
  closeDatabase: () => Promise<void>;
} {
  if (!config.databaseWritesEnabled) {
    const repository = new InMemoryCrawlRepository();
    console.log('DATABASE_WRITE_MODE=disabled, using in-memory task state. No database writes will be performed.');
    return {
      sourceRepository: repository,
      taskRepository: repository,
      artifactRepository: repository,
      eventRepository: repository,
      checkpointRepository: repository,
      taskQueue: new MemoryQueueService(),
      closeDatabase: async () => {},
    };
  }

  const pool = createPool(config);
  const repository = new CrawlRepository(pool, config.supabaseSchema);
  return {
    sourceRepository: repository,
    taskRepository: repository,
    artifactRepository: repository,
    eventRepository: repository,
    checkpointRepository: repository,
    taskQueue: new QueueService(config),
    closeDatabase: async () => {
      await pool.end();
    },
  };
}

const runtime = createRuntime();
const sourceHealthProbe = new HttpSourceHealthProbe();
const taskActivityService = new TaskActivityService(runtime.eventRepository, taskStreamBroadcaster);
const sourceCatalogService = new SourceCatalogService(runtime.sourceRepository, sourceHealthProbe, taskActivityService);
const manifestService = new ManifestService(runtime.taskRepository, runtime.artifactRepository, storageService);
const taskQueryService = new TaskQueryService(runtime.taskRepository, runtime.artifactRepository, storageService);
const taskCommandService = new TaskCommandService(runtime.taskRepository, runtime.taskQueue, taskActivityService);
const taskExecutionContextFactory = new TaskExecutionContextFactory(
  runtime.taskRepository,
  runtime.artifactRepository,
  runtime.checkpointRepository,
  runtime.sourceRepository,
  storageService,
  taskActivityService,
);
const taskExecutionService = new TaskExecutionService(
  runtime.taskRepository,
  runtime.sourceRepository,
  taskActivityService,
  taskExecutionContextFactory,
  manifestService,
);
const application = new CrawlerApplicationFacade(
  sourceCatalogService,
  taskCommandService,
  taskExecutionService,
  taskQueryService,
  taskStreamBroadcaster,
);

async function main() {
  await application.bootstrap();
  await runtime.taskQueue.start((taskId) => application.processTask(taskId));

  const app = createApp(application);
  const server = app.listen(config.port, () => {
    console.log(`LegalAdvisor API listening on http://localhost:${config.port}`);
  });

  const heartbeat = setInterval(() => {
    taskStreamBroadcaster.publish({ kind: 'heartbeat', occurredAt: new Date().toISOString() });
  }, 15000);

  const shutdown = async () => {
    clearInterval(heartbeat);
    server.close();
    await runtime.taskQueue.stop();
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
