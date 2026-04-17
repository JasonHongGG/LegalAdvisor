import process from 'node:process';
import { createApp } from './app.js';
import { sourceAdapterRegistry } from './adapters/index.js';
import type {
  ArtifactRepository,
  EventRepository,
  SourceRepository,
  RunRepository,
} from './application/ports/repositories.js';
import type { RunQueuePort } from './application/ports/runtime.js';
import { RunExecutionContextFactory } from './application/factories/runExecutionContextFactory.js';
import { CrawlerApplicationFacade } from './application/services/crawlerApplicationFacade.js';
import { LawArtifactRegistryService } from './application/services/lawArtifactRegistryService.js';
import { SourceCatalogService } from './application/services/sourceCatalogService.js';
import { RunActivityService } from './application/services/runActivityService.js';
import { RunCommandService } from './application/services/runCommandService.js';
import { RunExecutionService } from './application/services/runExecutionService.js';
import { RunLifecycleService } from './application/services/runLifecycleService.js';
import { RunQueryService } from './application/services/runQueryService.js';
import { loadConfig } from './config.js';
import { CrawlRepository } from './db/crawlRepository.js';
import { InMemoryCrawlRepository } from './db/inMemoryCrawlRepository.js';
import { createPool } from './db/pool.js';
import { HttpSourceHealthProbe } from './infrastructure/catalog/httpSourceHealthProbe.js';
import { SseRunStreamBroadcaster } from './infrastructure/stream/sseRunStreamBroadcaster.js';
import { MemoryQueueService } from './services/memoryQueueService.js';
import { QueueService } from './services/queueService.js';
import { StorageService } from './services/storageService.js';

const config = loadConfig();
const runStreamBroadcaster = new SseRunStreamBroadcaster();
const storageService = new StorageService();

function createRuntime(): {
  sourceRepository: SourceRepository;
  runRepository: RunRepository;
  artifactRepository: ArtifactRepository;
  eventRepository: EventRepository;
  runQueue: RunQueuePort;
  closeDatabase: () => Promise<void>;
} {
  if (!config.databaseWritesEnabled) {
    const repository = new InMemoryCrawlRepository();
    console.log('DATABASE_WRITE_MODE=disabled, using in-memory run state. No database writes will be performed.');
    return {
      sourceRepository: repository,
      runRepository: repository,
      artifactRepository: repository,
      eventRepository: repository,
      runQueue: new MemoryQueueService(),
      closeDatabase: async () => {},
    };
  }

  const pool = createPool(config);
  const repository = new CrawlRepository(pool, config.supabaseSchema);
  return {
    sourceRepository: repository,
    runRepository: repository,
    artifactRepository: repository,
    eventRepository: repository,
    runQueue: new QueueService(config),
    closeDatabase: async () => {
      await pool.end();
    },
  };
}

const runtime = createRuntime();
const sourceHealthProbe = new HttpSourceHealthProbe();
const runActivityService = new RunActivityService(runtime.eventRepository, runStreamBroadcaster);
const runLifecycleService = new RunLifecycleService(runtime.runRepository, runActivityService);
const sourceCatalogService = new SourceCatalogService(runtime.sourceRepository, sourceHealthProbe, runActivityService);
const lawArtifactRegistry = new LawArtifactRegistryService(runtime.artifactRepository, storageService);
const runQueryService = new RunQueryService(runtime.runRepository, runtime.artifactRepository, runtime.eventRepository);
const runCommandService = new RunCommandService(runtime.runRepository, runtime.runQueue, runActivityService, runLifecycleService);
const runExecutionContextFactory = new RunExecutionContextFactory(
  runtime.runRepository,
  runtime.artifactRepository,
  storageService,
  runActivityService,
  lawArtifactRegistry,
  runLifecycleService,
);
const runExecutionService = new RunExecutionService(
  runtime.runRepository,
  runtime.sourceRepository,
  runActivityService,
  runExecutionContextFactory,
  runLifecycleService,
  sourceAdapterRegistry,
);
const application = new CrawlerApplicationFacade(
  sourceCatalogService,
  runCommandService,
  runExecutionService,
  runQueryService,
  runStreamBroadcaster,
);

async function main() {
  await application.bootstrap();
  await runtime.runQueue.start((runId) => application.processRun(runId));

  const app = createApp(application);
  const server = app.listen(config.port, () => {
    console.log(`LegalAdvisor API listening on http://localhost:${config.port}`);
  });

  const heartbeat = setInterval(() => {
    runStreamBroadcaster.publish({ kind: 'heartbeat', occurredAt: new Date().toISOString() });
  }, 15000);

  const shutdown = async () => {
    clearInterval(heartbeat);
    server.close();
    await runtime.runQueue.stop();
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
