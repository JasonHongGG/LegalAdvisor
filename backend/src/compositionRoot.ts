import type { SourceCatalogService } from './application/services/sourceCatalogService.js';
import type { RunCommandService } from './application/services/runCommandService.js';
import type { RunExecutionService } from './application/services/runExecutionService.js';
import type { RunQueryService } from './application/services/runQueryService.js';
import type { RunStreamPublisher } from './application/ports/runtime.js';

export interface AppServices {
  sourceCatalogService: SourceCatalogService;
  runCommandService: RunCommandService;
  runExecutionService: RunExecutionService;
  runQueryService: RunQueryService;
  runStreamPublisher: RunStreamPublisher;
}
