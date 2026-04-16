import type { SourceRepository } from '../ports/repositories.js';
import type { SourceHealthProbe } from '../ports/runtime.js';
import type { TaskActivityService } from './taskActivityService.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { isoNow } from '../../utils.js';

export class SourceCatalogService {
  constructor(
    private readonly sourceRepository: SourceRepository,
    private readonly sourceHealthProbe: SourceHealthProbe,
    private readonly taskActivityService: TaskActivityService,
  ) {}

  async bootstrap() {
    await this.sourceRepository.ensureSourceCatalog(sourceRegistry.list());
    await this.refreshSources();
  }

  async listSources() {
    return this.sourceRepository.listSources();
  }

  async refreshSources() {
    const catalog = sourceRegistry.list();
    await Promise.all(
      catalog.map(async (source) => {
        const probeResult = await this.sourceHealthProbe.probe(source);
        await this.sourceRepository.updateSourceHealth(source.id, {
          healthStatus: probeResult.healthStatus,
          lastCheckedAt: isoNow(),
          lastErrorMessage: probeResult.lastErrorMessage,
        });
        this.taskActivityService.publishSourceUpdated(source.id);
      }),
    );

    return this.sourceRepository.listSources();
  }
}