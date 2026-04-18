import type { SourceOverviewDto as CrawlSourceRecord, SourceId } from '@legaladvisor/shared';
import type { SourceHealthPatch, SourceRepository } from '../../application/ports/repositories.js';
import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';
import { PgBase, parseJson, toIsoString } from './helpers.js';

export class PgSourceRepository extends PgBase implements SourceRepository {
  async ensureSourceCatalog(catalog: SourceCatalogEntry[]) {
    for (const source of catalog) {
      await this.db.query(
        `
          insert into ${this.table('crawl_sources')} (
            id, name, short_name, source_type, implementation_mode, base_url, description, notes,
            capabilities, run_builder_fields, recommended_concurrency, updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, now()
          )
          on conflict (id) do update set
            name = excluded.name,
            short_name = excluded.short_name,
            source_type = excluded.source_type,
            implementation_mode = excluded.implementation_mode,
            base_url = excluded.base_url,
            description = excluded.description,
            notes = excluded.notes,
            capabilities = excluded.capabilities,
            run_builder_fields = excluded.run_builder_fields,
            recommended_concurrency = excluded.recommended_concurrency,
            updated_at = now()
        `,
        [
          source.id,
          source.name,
          source.shortName,
          source.sourceType,
          source.implementationMode,
          source.baseUrl,
          source.description,
          source.notes,
          JSON.stringify(source.capabilities),
          JSON.stringify(source.runBuilderFields),
          source.recommendedConcurrency,
        ],
      );
    }
  }

  async listSources(): Promise<CrawlSourceRecord[]> {
    const result = await this.db.query(`select * from ${this.table('crawl_sources')} order by name asc`);
    return result.rows.map((row) => this.mapSource(row));
  }

  async updateSourceHealth(sourceId: SourceId, patch: SourceHealthPatch) {
    await this.db.query(
      `
        update ${this.table('crawl_sources')}
        set
          health_status = $2,
          last_checked_at = $3,
          last_error_message = $4,
          updated_at = now()
        where id = $1
      `,
      [sourceId, patch.healthStatus, patch.lastCheckedAt, patch.lastErrorMessage ?? null],
    );
  }

  async getSourceById(sourceId: SourceId) {
    const result = await this.db.query(`select * from ${this.table('crawl_sources')} where id = $1 limit 1`, [sourceId]);
    return result.rowCount ? this.mapSource(result.rows[0]) : null;
  }

  private mapSource(row: Record<string, unknown>): CrawlSourceRecord {
    return {
      id: String(row.id) as SourceId,
      name: String(row.name),
      shortName: String(row.short_name),
      sourceType: row.source_type as CrawlSourceRecord['sourceType'],
      implementationMode: row.implementation_mode as CrawlSourceRecord['implementationMode'],
      baseUrl: String(row.base_url),
      description: String(row.description),
      notes: String(row.notes),
      healthStatus: row.health_status as CrawlSourceRecord['healthStatus'],
      recommendedConcurrency: Number(row.recommended_concurrency ?? 1),
      lastCheckedAt: toIsoString(row.last_checked_at),
      lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
      capabilities: parseJson<string[]>(row.capabilities, []),
      runBuilderFields: parseJson(row.run_builder_fields, []),
    };
  }
}
