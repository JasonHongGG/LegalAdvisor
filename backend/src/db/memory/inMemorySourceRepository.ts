import type { SourceOverviewDto as CrawlSourceRecord, SourceId } from '@legaladvisor/shared';
import type { SourceHealthPatch, SourceRepository } from '../../application/ports/repositories.js';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';
import { type InMemoryDataStore, clone } from './inMemoryDataStore.js';

export class InMemorySourceRepository implements SourceRepository {
  constructor(private readonly store: InMemoryDataStore) {}

  async ensureSourceCatalog(catalog: SourceCatalogEntry[]) {
    for (const source of catalog) {
      const existing = this.store.sources.get(source.id);
      this.store.sources.set(source.id, {
        id: source.id,
        name: source.name,
        shortName: source.shortName,
        sourceType: source.sourceType,
        implementationMode: source.implementationMode,
        baseUrl: source.baseUrl,
        description: source.description,
        notes: source.notes,
        healthStatus: existing?.healthStatus ?? 'unknown',
        recommendedConcurrency: existing?.recommendedConcurrency ?? source.recommendedConcurrency,
        lastCheckedAt: existing?.lastCheckedAt ?? null,
        lastErrorMessage: existing?.lastErrorMessage ?? null,
        capabilities: clone(source.capabilities),
        runBuilderFields: clone(source.runBuilderFields),
      });
    }
  }

  async listSources(): Promise<CrawlSourceRecord[]> {
    return [...this.store.sources.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((source) => clone(source));
  }

  async updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch) {
    const source = this.store.requireSource(sourceId);
    source.healthStatus = patch.healthStatus;
    source.lastCheckedAt = patch.lastCheckedAt;
    source.lastErrorMessage = patch.lastErrorMessage ?? null;
  }

  async getSourceById(sourceId: SourceId) {
    const source = this.store.sources.get(sourceId);
    return source ? clone(source) : null;
  }
}
