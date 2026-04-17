import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { loadConfig } from '../config.js';
import { createId, sha256 } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const currentExecutionCoreRelations = [
  'crawl_sources',
  'crawl_runs',
  'crawl_run_targets',
  'crawl_work_items',
  'crawl_events',
  'canonical_law_documents',
  'canonical_law_versions',
  'artifact_contents',
  'artifacts',
  'crawl_run_artifact_links',
] as const;
const runSchemaCutoverRelations = [
  'crawl_tasks',
  'crawl_task_targets',
  'crawl_task_artifact_links',
] as const;
const incompatibleLegacyExecutionCoreRelations = [
  'source_definitions',
  'crawl_jobs',
  'crawl_targets',
  'run_units',
  'run_events',
  'blob_contents',
  'artifact_definitions',
  'run_output_links',
  'canonical_artifact_links',
] as const;
const supportedArtifactKinds = new Set([
  'law_source_snapshot',
  'law_document_snapshot',
  'law_article_snapshot',
  'law_revision_snapshot',
  'judicial_site_snapshot',
  'judicial_site_markdown',
  'judgment_source_snapshot',
  'judgment_document_snapshot',
  'debug_payload',
]);

async function main() {
  const config = loadConfig();
  if (!config.databaseWritesEnabled) {
    console.log('DATABASE_WRITE_MODE=disabled, skip database migration.');
    return;
  }

  if (!config.supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL is required when DATABASE_WRITE_MODE=enabled.');
  }

  const pool = new Pool({
    connectionString: config.supabaseDbUrl,
    ssl: config.supabaseDbUrl.includes('sslmode=disable') ? false : undefined,
  });
  let poolClosing = false;

  pool.on('error', (error) => {
    const isExpectedShutdown = poolClosing && error.message.includes(':db_termination');
    if (isExpectedShutdown) {
      return;
    }

    throw error;
  });

  const migrationSchema = config.supabaseSchema;
  const sqlDir = path.resolve(__dirname, '../../sql');
  const files = (await fs.readdir(sqlDir)).filter((file) => file.endsWith('.sql')).sort();

  await ensureSchemaMigrationsTable(pool, migrationSchema);

  await repairSchemaDriftIfNeeded(pool, migrationSchema, files);

  for (const file of files) {
    const alreadyApplied = await pool.query(
      `select 1 from ${migrationSchema}.schema_migrations where file_name = $1 limit 1`,
      [file],
    );
    if (alreadyApplied.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(sqlDir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(`insert into ${migrationSchema}.schema_migrations (file_name) values ($1)`, [file]);
      await client.query('commit');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  await backfillLegacyArtifacts(pool, config.supabaseSchema, path.resolve(__dirname, '../../.artifacts'));

  poolClosing = true;
  await pool.end();
}

async function repairSchemaDriftIfNeeded(pool: Pool, schema: string, filesOnDisk: string[]) {
  const [appliedResult, existingRelations] = await Promise.all([
    pool.query(`select file_name from ${schema}.schema_migrations order by file_name`),
    listExistingRelations(pool, schema, [
      ...currentExecutionCoreRelations,
      ...runSchemaCutoverRelations,
      ...incompatibleLegacyExecutionCoreRelations,
    ]),
  ]);

  if (!appliedResult.rowCount) {
    return;
  }

  const existingRelationSet = new Set(existingRelations);
  const missingCurrentRelations = currentExecutionCoreRelations.filter((relation) => !existingRelationSet.has(relation));
  if (missingCurrentRelations.length === 0) {
    return;
  }

  const hasRunSchemaCutover = runSchemaCutoverRelations.some((relation) => existingRelationSet.has(relation));
  if (hasRunSchemaCutover) {
    return;
  }

  const appliedFileNames = appliedResult.rows.map((row) => String(row.file_name));
  const staleFileNames = appliedFileNames.filter((fileName) => !filesOnDisk.includes(fileName));
  const hasIncompatibleLegacyExecutionCore = incompatibleLegacyExecutionCoreRelations.some((relation) => existingRelationSet.has(relation));

  if (existingRelations.length === 0 || hasIncompatibleLegacyExecutionCore) {
    console.warn(
      hasIncompatibleLegacyExecutionCore
        ? `Detected incompatible legacy execution-core tables in schema "${schema}". Resetting the schema and replaying all current workspace migrations.`
        : `Detected stale migration history in schema "${schema}": schema_migrations has entries but none of the core tables exist. Resetting migration history and replaying all workspace migrations.`,
    );
    if (staleFileNames.length > 0) {
      console.warn(`Removing stale migration records not present on disk: ${staleFileNames.join(', ')}`);
    }
    await pool.query(`drop schema if exists ${schema} cascade`);
    await ensureSchemaMigrationsTable(pool, schema);
    return;
  }

  throw new Error(
    `Schema drift detected in ${schema}: missing required tables ${missingCurrentRelations.join(', ')} while migration history already exists. ` +
      `Please back up the database, clear ${schema}.schema_migrations manually, and rerun npm run db:migrate.`,
  );
}

async function ensureSchemaMigrationsTable(pool: Pool, schema: string) {
  await pool.query(`create schema if not exists ${schema}`);
  await pool.query(`
    create table if not exists ${schema}.schema_migrations (
      file_name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function backfillLegacyArtifacts(pool: Pool, schema: string, legacyArtifactRoot: string) {
  const [hasLegacyTaskArtifacts, hasLegacyCanonicalArtifacts, hasLegacyRunArtifactRefs, hasLegacyTaskArtifactRefs, hasNewArtifactTables] = await Promise.all([
    tableExists(pool, schema, 'crawl_artifacts'),
    tableExists(pool, schema, 'canonical_law_version_artifacts'),
    tableExists(pool, schema, 'crawl_run_artifact_refs'),
    tableExists(pool, schema, 'crawl_task_artifact_refs'),
    tableExists(pool, schema, 'artifacts'),
  ]);

  const legacyArtifactRefsTableName = hasLegacyRunArtifactRefs
    ? 'crawl_run_artifact_refs'
    : hasLegacyTaskArtifactRefs
      ? 'crawl_task_artifact_refs'
      : null;

  if (!hasNewArtifactTables || (!hasLegacyTaskArtifacts && !hasLegacyCanonicalArtifacts && !legacyArtifactRefsTableName)) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    if (hasLegacyTaskArtifacts) {
      const result = await client.query(`select * from ${schema}.crawl_artifacts order by created_at asc`);
      for (const row of result.rows) {
        if (!supportedArtifactKinds.has(String(row.artifact_kind))) {
          continue;
        }
        const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
        const buffer = await readLegacyArtifactBuffer(legacyArtifactRoot, String(row.storage_path));
        const legacyRunId = readOptionalString(row.run_id) ?? readOptionalString(row.task_id);
        if (!legacyRunId) {
          throw new Error(`Legacy crawl_artifacts row ${String(row.id)} is missing run_id/task_id.`);
        }
        const contentId = await ensureArtifactContent(client, schema, {
          hashSha256: sha256(buffer),
          contentType: String(row.content_type),
          sizeBytes: buffer.byteLength,
          encoding: 'utf-8',
          buffer,
        });

        await client.query(
          `
            insert into ${schema}.artifacts (
              id, canonical_document_id, canonical_version_id, artifact_kind, artifact_role, file_name, content_id,
              content_type, size_bytes, hash_sha256, schema_version, metadata, created_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
            on conflict (id) do nothing
          `,
          [
            String(row.id),
            readOptionalString(metadata.canonicalDocumentId),
            readOptionalString(metadata.canonicalVersionId),
            String(row.artifact_kind),
            inferArtifactRole(metadata, String(row.artifact_kind)),
            String(row.file_name),
            contentId,
            String(row.content_type),
            Number(row.size_bytes ?? buffer.byteLength),
            String(row.hash_sha256 ?? sha256(buffer)),
            String(row.schema_version),
            JSON.stringify({
              ...metadata,
              artifactRole: inferArtifactRole(metadata, String(row.artifact_kind)),
              contentStatus: 'run-only',
              canonicalDocumentId: readOptionalString(metadata.canonicalDocumentId),
              canonicalVersionId: readOptionalString(metadata.canonicalVersionId),
            }),
            row.created_at,
          ],
        );

        await client.query(
          `
            insert into ${schema}.crawl_run_artifact_links (id, run_id, work_item_id, artifact_id, content_status, created_at)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (id) do nothing
          `,
          [String(row.id), legacyRunId, row.work_item_id ? String(row.work_item_id) : null, String(row.id), 'run-only', row.created_at],
        );
      }
    }

    if (hasLegacyCanonicalArtifacts) {
      const result = await client.query(`select * from ${schema}.canonical_law_version_artifacts order by created_at asc`);
      for (const row of result.rows) {
        if (!supportedArtifactKinds.has(String(row.artifact_kind))) {
          continue;
        }
        const metadata = parseJson<Record<string, unknown>>(row.metadata, {});
        const buffer = await readLegacyArtifactBuffer(legacyArtifactRoot, String(row.storage_path));
        const contentId = await ensureArtifactContent(client, schema, {
          hashSha256: sha256(buffer),
          contentType: String(row.content_type),
          sizeBytes: buffer.byteLength,
          encoding: 'utf-8',
          buffer,
        });

        await client.query(
          `
            insert into ${schema}.artifacts (
              id, canonical_document_id, canonical_version_id, artifact_kind, artifact_role, file_name, content_id,
              content_type, size_bytes, hash_sha256, schema_version, metadata, created_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
            on conflict (id) do nothing
          `,
          [
            String(row.id),
            String(row.law_document_id),
            String(row.law_version_id),
            String(row.artifact_kind),
            String(row.artifact_role),
            String(row.file_name),
            contentId,
            String(row.content_type),
            Number(row.size_bytes ?? buffer.byteLength),
            String(row.hash_sha256 ?? sha256(buffer)),
            String(row.schema_version),
            JSON.stringify({
              ...metadata,
              artifactRole: String(row.artifact_role),
              contentStatus: 'new',
              canonicalDocumentId: String(row.law_document_id),
              canonicalVersionId: String(row.law_version_id),
            }),
            row.created_at,
          ],
        );
      }
    }

    if (legacyArtifactRefsTableName) {
      const result = await client.query(`select * from ${schema}.${legacyArtifactRefsTableName} order by created_at asc`);
      for (const row of result.rows) {
        const legacyRunId = readOptionalString(row.run_id) ?? readOptionalString(row.task_id);
        if (!legacyRunId) {
          throw new Error(`Legacy artifact ref row ${String(row.id)} is missing run_id/task_id.`);
        }
        await client.query(
          `
            insert into ${schema}.crawl_run_artifact_links (id, run_id, work_item_id, artifact_id, content_status, created_at)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (id) do nothing
          `,
          [
            String(row.id),
            legacyRunId,
            row.work_item_id ? String(row.work_item_id) : null,
            String(row.canonical_artifact_id),
            String(row.content_status),
            row.created_at,
          ],
        );
      }
    }

  await client.query(`drop table if exists ${schema}.crawl_run_artifact_refs`);
    await client.query(`drop table if exists ${schema}.crawl_task_artifact_refs`);
    await client.query(`drop table if exists ${schema}.canonical_law_version_artifacts`);
    await client.query(`drop table if exists ${schema}.crawl_artifacts`);

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function tableExists(pool: Pool, schema: string, tableName: string) {
  const result = await pool.query(`select to_regclass($1) as regclass_name`, [`${schema}.${tableName}`]);
  return Boolean(result.rows[0]?.regclass_name);
}

async function listExistingRelations(pool: Pool, schema: string, tableNames: readonly string[]) {
  const result = await pool.query(
    `
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relname = any($2::text[])
      order by c.relname asc
    `,
    [schema, tableNames],
  );

  return result.rows.map((row) => String(row.relname));
}

async function ensureArtifactContent(
  client: PoolClient,
  schema: string,
  input: {
    hashSha256: string;
    contentType: string;
    sizeBytes: number;
    encoding: 'utf-8' | null;
    buffer: Buffer;
  },
) {
  const result = await client.query(
    `
      insert into ${schema}.artifact_contents (
        id, hash_sha256, content_type, size_bytes, encoding, content, created_at
      ) values ($1, $2, $3, $4, $5, $6, now())
      on conflict (hash_sha256) do update set
        content_type = excluded.content_type,
        size_bytes = excluded.size_bytes,
        encoding = excluded.encoding
      returning id
    `,
    [createId(), input.hashSha256, input.contentType, input.sizeBytes, input.encoding, input.buffer],
  );
  return String(result.rows[0].id);
}

async function readLegacyArtifactBuffer(rootDir: string, storagePath: string) {
  const fullPath = path.resolve(rootDir, storagePath);
  return fs.readFile(fullPath);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return fallback;
}

function inferArtifactRole(metadata: Record<string, unknown>, artifactKind: string) {
  const metadataRole = metadata.artifactRole;
  if (typeof metadataRole === 'string') {
    return metadataRole;
  }

  switch (artifactKind) {
    case 'law_source_snapshot':
      return 'provenance';
    case 'law_article_snapshot':
      return 'machine-source';
    case 'law_revision_snapshot':
      return 'version-evidence';
    case 'law_document_snapshot':
    case 'judicial_site_markdown':
    case 'judgment_document_snapshot':
      return 'review-output';
    case 'debug_payload':
      return 'debug';
    default:
      return 'crawler-output';
  }
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
