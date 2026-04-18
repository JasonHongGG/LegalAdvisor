import type {
  ArtifactDto as CrawlArtifact,
  SourceId,
} from '@legaladvisor/shared';
import type {
  ArtifactContentRecord,
  ArtifactRepository,
  CanonicalArtifactInput,
  CanonicalLawDocumentInput,
  CanonicalLawVersionInput,
  CanonicalLawVersionMatch,
  EnsureArtifactContentInput,
  InsertArtifactInput,
  LinkedRunArtifactInput,
} from '../../application/ports/repositories.js';
import { createId } from '../../utils.js';
import { PgBase, parseJson, toIsoString } from './helpers.js';

export class PgArtifactRepository extends PgBase implements ArtifactRepository {
  async ensureArtifactContent(input: EnsureArtifactContentInput) {
    const result = await this.db.query(
      `
        insert into ${this.table('artifact_contents')} (
          id, hash_sha256, content_type, size_bytes, encoding, content, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (hash_sha256) do update set
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          encoding = excluded.encoding
        returning id, hash_sha256, content_type, size_bytes, encoding
      `,
      [createId(), input.hashSha256, input.contentType, input.sizeBytes, input.encoding, input.buffer, input.createdAt ?? new Date().toISOString()],
    );

    return {
      id: String(result.rows[0].id),
      hashSha256: String(result.rows[0].hash_sha256),
      contentType: String(result.rows[0].content_type),
      sizeBytes: Number(result.rows[0].size_bytes ?? 0),
      encoding: (result.rows[0].encoding ? String(result.rows[0].encoding) : null) as ArtifactContentRecord['encoding'],
    };
  }

  async insertArtifact(input: InsertArtifactInput) {
    const client = await this.getClient();
    const artifactId = createId();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const metadata = {
      ...input.metadata,
      artifactRole: input.artifactRole,
      contentStatus: input.contentStatus,
      canonicalDocumentId: input.canonicalDocumentId,
      canonicalVersionId: input.canonicalVersionId,
    };

    try {
      await client.query('begin');
      await client.query(
        `
          insert into ${this.table('artifacts')} (
            id, canonical_document_id, canonical_version_id, artifact_kind, artifact_role, file_name, content_id,
            content_type, size_bytes, hash_sha256, schema_version, metadata, created_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        `,
        [
          artifactId,
          input.canonicalDocumentId,
          input.canonicalVersionId,
          input.artifactKind,
          input.artifactRole,
          input.fileName,
          input.contentId,
          input.contentType,
          input.sizeBytes,
          input.hashSha256,
          input.schemaVersion,
          JSON.stringify(metadata),
          createdAt,
        ],
      );

      await client.query(
        `
          insert into ${this.table('crawl_run_artifact_links')} (
            id, run_id, work_item_id, artifact_id, content_status, created_at
          ) values ($1, $2, $3, $4, $5, $6)
        `,
        [input.id, input.runId, input.workItemId, artifactId, input.contentStatus, createdAt],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const artifact = await this.getArtifact(input.id);
    if (!artifact) {
      throw new Error(`Artifact link ${input.id} not found after insert.`);
    }
    return artifact;
  }

  async getArtifact(artifactId: string) {
    const result = await this.db.query(
      `
        select
          link.id,
          link.run_id,
          link.work_item_id,
          link.content_status,
          link.created_at,
          artifact.canonical_document_id,
          artifact.canonical_version_id,
          artifact.artifact_kind,
          artifact.artifact_role,
          artifact.file_name,
          artifact.content_type,
          artifact.size_bytes,
          artifact.hash_sha256,
          artifact.schema_version,
          artifact.metadata
        from ${this.table('crawl_run_artifact_links')} link
        join ${this.table('artifacts')} artifact on artifact.id = link.artifact_id
        where link.id = $1
        limit 1
      `,
      [artifactId],
    );

    return result.rowCount ? this.mapLinkedArtifact(result.rows[0]) : null;
  }

  async getArtifactContent(artifactId: string) {
    const linkedResult = await this.db.query(
      `
        select content.content
        from ${this.table('crawl_run_artifact_links')} link
        join ${this.table('artifacts')} artifact on artifact.id = link.artifact_id
        join ${this.table('artifact_contents')} content on content.id = artifact.content_id
        where link.id = $1
        limit 1
      `,
      [artifactId],
    );
    if (linkedResult.rowCount) {
      return Buffer.from(linkedResult.rows[0].content);
    }

    const canonicalResult = await this.db.query(
      `
        select content.content
        from ${this.table('artifacts')} artifact
        join ${this.table('artifact_contents')} content on content.id = artifact.content_id
        where artifact.id = $1
        limit 1
      `,
      [artifactId],
    );
    return canonicalResult.rowCount ? Buffer.from(canonicalResult.rows[0].content) : null;
  }

  async ensureCanonicalLawDocument(input: CanonicalLawDocumentInput) {
    const result = await this.db.query(
      `
        insert into ${this.table('canonical_law_documents')} (
          id, source_id, law_name, normalized_law_name, english_name, law_level, category, law_url, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        on conflict (source_id, normalized_law_name) do update set
          law_name = excluded.law_name,
          english_name = excluded.english_name,
          law_level = excluded.law_level,
          category = excluded.category,
          law_url = excluded.law_url,
          updated_at = now()
        returning id
      `,
      [createId(), input.sourceId, input.lawName, input.normalizedLawName, input.englishName, input.lawLevel, input.category, input.lawUrl],
    );

    return String(result.rows[0].id);
  }

  async findCanonicalLawVersion(sourceId: SourceId, normalizedLawName: string, versionFingerprint: string): Promise<CanonicalLawVersionMatch | null> {
    const versionResult = await this.db.query(
      `
        select version.id, version.law_document_id, version.version_fingerprint
        from ${this.table('canonical_law_versions')} version
        join ${this.table('canonical_law_documents')} law on law.id = version.law_document_id
        where version.source_id = $1 and law.normalized_law_name = $2 and version.version_fingerprint = $3
        limit 1
      `,
      [sourceId, normalizedLawName, versionFingerprint],
    );

    if (!versionResult.rowCount) {
      return null;
    }

    const versionRow = versionResult.rows[0];
    const artifactsResult = await this.db.query(
      `select * from ${this.table('artifacts')} where canonical_version_id = $1 order by created_at desc`,
      [versionRow.id],
    );

    return {
      lawDocumentId: String(versionRow.law_document_id),
      lawVersionId: String(versionRow.id),
      versionFingerprint: String(versionRow.version_fingerprint),
      artifacts: artifactsResult.rows.map((row) => this.mapCanonicalArtifact(row)),
    };
  }

  async createCanonicalLawVersion(input: CanonicalLawVersionInput) {
    const result = await this.db.query(
      `
        insert into ${this.table('canonical_law_versions')} (
          id, law_document_id, source_id, law_name, modified_date, effective_date, source_update_date, version_fingerprint, first_seen_at, last_seen_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        on conflict (law_document_id, version_fingerprint) do update set
          last_seen_at = now()
        returning id
      `,
      [createId(), input.lawDocumentId, input.sourceId, input.lawName, input.modifiedDate, input.effectiveDate, input.sourceUpdateDate, input.versionFingerprint],
    );

    return String(result.rows[0].id);
  }

  async insertCanonicalArtifact(input: CanonicalArtifactInput) {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const metadata = {
      ...input.metadata,
      artifactRole: input.artifactRole,
      contentStatus: 'new',
      canonicalDocumentId: input.lawDocumentId,
      canonicalVersionId: input.lawVersionId,
    };

    const result = await this.db.query(
      `
        insert into ${this.table('artifacts')} (
          id, canonical_document_id, canonical_version_id, artifact_kind, artifact_role, file_name, content_id,
          content_type, size_bytes, hash_sha256, schema_version, metadata, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        on conflict (canonical_version_id, artifact_kind) do update set
          artifact_role = excluded.artifact_role,
          file_name = excluded.file_name,
          content_id = excluded.content_id,
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          hash_sha256 = excluded.hash_sha256,
          schema_version = excluded.schema_version,
          metadata = excluded.metadata
        returning id
      `,
      [
        input.id,
        input.lawDocumentId,
        input.lawVersionId,
        input.artifactKind,
        input.artifactRole,
        input.fileName,
        input.contentId,
        input.contentType,
        input.sizeBytes,
        input.hashSha256,
        input.schemaVersion,
        JSON.stringify(metadata),
        createdAt,
      ],
    );

    const actualId = String(result.rows[0].id);

    return {
      id: actualId,
      runId: `canonical:${input.lawVersionId}`,
      workItemId: null,
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      contentStatus: 'new',
      canonicalDocumentId: input.lawDocumentId,
      canonicalVersionId: input.lawVersionId,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      hashSha256: input.hashSha256,
      schemaVersion: input.schemaVersion,
      metadata,
      createdAt,
    } satisfies CrawlArtifact;
  }

  async linkRunArtifact(input: LinkedRunArtifactInput) {
    const result = await this.db.query(
      `
        insert into ${this.table('crawl_run_artifact_links')} (
          id, run_id, work_item_id, artifact_id, content_status, created_at
        ) values ($1, $2, $3, $4, $5, $6)
        on conflict (run_id, work_item_id, artifact_id) do update set
          content_status = excluded.content_status
        returning id
      `,
      [input.id ?? createId(), input.runId, input.workItemId, input.canonicalArtifactId, input.contentStatus, input.createdAt ?? new Date().toISOString()],
    );

    const artifact = await this.getArtifact(String(result.rows[0].id));
    if (!artifact) {
      throw new Error(`Linked artifact ${String(result.rows[0].id)} not found after insert.`);
    }
    return artifact;
  }

  async listRunArtifacts(runId: string) {
    const result = await this.db.query(
      `
        select
          link.id,
          link.run_id,
          link.work_item_id,
          link.content_status,
          link.created_at,
          artifact.canonical_document_id,
          artifact.canonical_version_id,
          artifact.artifact_kind,
          artifact.artifact_role,
          artifact.file_name,
          artifact.content_type,
          artifact.size_bytes,
          artifact.hash_sha256,
          artifact.schema_version,
          artifact.metadata
        from ${this.table('crawl_run_artifact_links')} link
        join ${this.table('artifacts')} artifact on artifact.id = link.artifact_id
        where link.run_id = $1
        order by link.created_at desc
      `,
      [runId],
    );

    return result.rows.map((row) => this.mapLinkedArtifact(row));
  }

  private mapLinkedArtifact(row: Record<string, unknown>): CrawlArtifact {
    const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
    return {
      id: String(row.id),
      runId: String(row.run_id),
      workItemId: row.work_item_id ? String(row.work_item_id) : null,
      artifactKind: row.artifact_kind as CrawlArtifact['artifactKind'],
      artifactRole: row.artifact_role as CrawlArtifact['artifactRole'],
      contentStatus: row.content_status as CrawlArtifact['contentStatus'],
      canonicalDocumentId: row.canonical_document_id ? String(row.canonical_document_id) : null,
      canonicalVersionId: row.canonical_version_id ? String(row.canonical_version_id) : null,
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes ?? 0),
      hashSha256: String(row.hash_sha256),
      schemaVersion: String(row.schema_version),
      metadata,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    };
  }

  private mapCanonicalArtifact(row: Record<string, unknown>): CrawlArtifact {
    const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
    return {
      id: String(row.id),
      runId: `canonical:${String(row.canonical_version_id)}`,
      workItemId: null,
      artifactKind: row.artifact_kind as CrawlArtifact['artifactKind'],
      artifactRole: row.artifact_role as CrawlArtifact['artifactRole'],
      contentStatus: 'new',
      canonicalDocumentId: row.canonical_document_id ? String(row.canonical_document_id) : null,
      canonicalVersionId: row.canonical_version_id ? String(row.canonical_version_id) : null,
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes ?? 0),
      hashSha256: String(row.hash_sha256),
      schemaVersion: String(row.schema_version),
      metadata,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    };
  }
}
