import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.supabaseDbUrl,
    ssl: config.supabaseDbUrl.includes('sslmode=disable') ? false : undefined,
  });

  try {
    const migrationSchema = config.supabaseSchema;
    const sqlDir = path.resolve(__dirname, '../../sql');
    const files = (await fs.readdir(sqlDir)).filter((file) => file.endsWith('.sql')).sort();

    await ensureSchemaMigrationsTable(pool, migrationSchema);

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
  } finally {
    await pool.end();
  }
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
