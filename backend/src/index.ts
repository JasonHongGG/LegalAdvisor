import process from 'node:process';
import { createApp } from './app.js';
import { sourceAdapterRegistry } from './adapters/index.js';
import type {
  ArtifactRepository,
  EventRepository,
  SourceRepository,
  StageRepository,
  RunRepository,
} from './application/ports/repositories.js';
import type { RunQueuePort } from './application/ports/runtime.js';
import { RunExecutionContextFactory } from './application/factories/runExecutionContextFactory.js';
import { LawArtifactRegistryService } from './application/services/lawArtifactRegistryService.js';
import { SourceCatalogService } from './application/services/sourceCatalogService.js';
import { RunActivityService } from './application/services/runActivityService.js';
import { RunCommandService } from './application/services/runCommandService.js';
import { RunExecutionService } from './application/services/runExecutionService.js';
import { RunLifecycleService } from './application/services/runLifecycleService.js';
import { RunQueryService } from './application/services/runQueryService.js';
import type { AppServices } from './compositionRoot.js';
import { loadConfig } from './config.js';
import { PgSourceRepository, PgRunRepository, PgArtifactRepository, PgEventRepository, PgStageRepository } from './db/pg/index.js';
import { createPool } from './db/pool.js';
import { HttpSourceHealthProbe } from './infrastructure/catalog/httpSourceHealthProbe.js';
import { SseRunStreamBroadcaster } from './infrastructure/stream/sseRunStreamBroadcaster.js';
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
  stageRepository: StageRepository;
  runQueue: RunQueuePort;
  closeDatabase: () => Promise<void>;
} {
  const pool = createPool(config);
  const schema = config.supabaseSchema;
  const sourceRepository = new PgSourceRepository(pool, schema);
  const stageRepository = new PgStageRepository(pool, schema);
  const artifactRepository = new PgArtifactRepository(pool, schema);
  const eventRepository = new PgEventRepository(pool, schema, stageRepository);
  const runRepository = new PgRunRepository(pool, schema, artifactRepository, eventRepository, stageRepository);
  return {
    sourceRepository,
    runRepository,
    artifactRepository,
    eventRepository,
    stageRepository,
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
const runCommandService = new RunCommandService(
  runtime.sourceRepository,
  runtime.runRepository,
  runtime.runQueue,
  runActivityService,
  runLifecycleService,
  sourceAdapterRegistry,
);
const runExecutionContextFactory = new RunExecutionContextFactory(
  runtime.runRepository,
  runtime.artifactRepository,
  storageService,
  runActivityService,
  lawArtifactRegistry,
  runLifecycleService,
  runtime.stageRepository,
);
const runExecutionService = new RunExecutionService(
  runtime.runRepository,
  runtime.sourceRepository,
  runActivityService,
  runExecutionContextFactory,
  runLifecycleService,
  sourceAdapterRegistry,
);
const services: AppServices = {
  sourceCatalogService,
  runCommandService,
  runExecutionService,
  runQueryService,
  runStreamPublisher: runStreamBroadcaster,
};

async function main() {
  await sourceCatalogService.bootstrap();
  await runtime.runQueue.start((runId) => runExecutionService.processRun(runId));

  const app = createApp(services);
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
