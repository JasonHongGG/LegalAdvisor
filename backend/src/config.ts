import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer backend/.env, then allow a root .env as a fallback for local development.
loadDotenv({ path: path.resolve(__dirname, '../.env') });
loadDotenv({ path: path.resolve(__dirname, '../../.env') });

const schemaName = z.string().regex(/^[a-z_][a-z0-9_]*$/);

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    SUPABASE_DB_URL: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().min(1)),
    SUPABASE_SCHEMA: schemaName.default('legal_advisor'),
    SUPABASE_QUEUE_SCHEMA: schemaName.default('legal_advisor_queue'),
    SOURCE_FETCH_INSECURE_TLS: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),
  });

export interface AppConfig {
  port: number;
  supabaseDbUrl: string;
  supabaseSchema: string;
  supabaseQueueSchema: string;
  sourceFetchInsecureTls: boolean;
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('\n');
    throw new Error(
      `後端環境設定不完整。請先建立 backend/.env，再重新啟動後端。\n` +
        `可直接複製 backend/.env.example 為 backend/.env 後填入實際值。\n` +
        `此版本已移除 production in-memory runtime，必須提供可用的資料庫連線。\n\n` +
        `${issues}`,
    );
  }

  cachedConfig = {
    port: parsed.data.PORT,
    supabaseDbUrl: parsed.data.SUPABASE_DB_URL,
    supabaseSchema: parsed.data.SUPABASE_SCHEMA,
    supabaseQueueSchema: parsed.data.SUPABASE_QUEUE_SCHEMA,
    sourceFetchInsecureTls: parsed.data.SOURCE_FETCH_INSECURE_TLS,
  };

  return cachedConfig;
}
