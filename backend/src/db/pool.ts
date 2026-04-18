import { Pool } from 'pg';
import type { AppConfig } from '../config.js';

export function createPool(config: AppConfig) {
  if (!config.supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL is required for the database-backed runtime.');
  }

  const disableSsl = config.supabaseDbUrl.includes('sslmode=disable');
  const pool = new Pool({
    connectionString: config.supabaseDbUrl,
    ssl: disableSsl ? false : undefined,
    max: 10,
  });

  pool.on('error', (error) => {
    console.error('Database pool error:', error);
  });

  return pool;
}
