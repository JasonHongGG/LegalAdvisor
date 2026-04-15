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
    DATABASE_WRITE_MODE: z.enum(['enabled', 'disabled']).default('enabled'),
    SUPABASE_URL: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().url().optional()),
    SUPABASE_DB_URL: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().min(1).optional()),
    SUPABASE_SERVICE_ROLE: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), z.string().min(1).optional()),
    SUPABASE_SCHEMA: schemaName.default('legal_advisor'),
    SUPABASE_QUEUE_SCHEMA: schemaName.default('legal_advisor_queue'),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default('legal-advisor-artifacts'),
    OUTPUT_STORAGE_MODE: z.enum(['supabase', 'local']).default('local'),
    LOCAL_ARTIFACT_DIR: z.string().min(1).default('.artifacts'),
    SOURCE_FETCH_INSECURE_TLS: z
      .string()
      .optional()
      .transform((value) => value !== 'false'),
  })
  .superRefine((value, ctx) => {
    if (value.DATABASE_WRITE_MODE === 'enabled' && !value.SUPABASE_DB_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_DB_URL'],
        message: 'DATABASE_WRITE_MODE=enabled 時必須提供 SUPABASE_DB_URL。',
      });
    }

    if (value.OUTPUT_STORAGE_MODE === 'supabase' && (!value.SUPABASE_URL || !value.SUPABASE_SERVICE_ROLE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OUTPUT_STORAGE_MODE'],
        message: 'OUTPUT_STORAGE_MODE=supabase 時必須提供 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE。',
      });
    }
  });

export interface AppConfig {
  port: number;
  databaseWriteMode: 'enabled' | 'disabled';
  databaseWritesEnabled: boolean;
  supabaseUrl: string | null;
  supabaseDbUrl: string | null;
  supabaseServiceRole: string | null;
  supabaseSchema: string;
  supabaseQueueSchema: string;
  supabaseStorageBucket: string;
  outputStorageMode: 'supabase' | 'local';
  localArtifactDir: string;
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
        `若目前只想測流程、不想寫入資料庫，可改設 DATABASE_WRITE_MODE=disabled。\n\n` +
        `${issues}`,
    );
  }

  cachedConfig = {
    port: parsed.data.PORT,
    databaseWriteMode: parsed.data.DATABASE_WRITE_MODE,
    databaseWritesEnabled: parsed.data.DATABASE_WRITE_MODE === 'enabled',
    supabaseUrl: parsed.data.SUPABASE_URL ?? null,
    supabaseDbUrl: parsed.data.SUPABASE_DB_URL ?? null,
    supabaseServiceRole: parsed.data.SUPABASE_SERVICE_ROLE ?? null,
    supabaseSchema: parsed.data.SUPABASE_SCHEMA,
    supabaseQueueSchema: parsed.data.SUPABASE_QUEUE_SCHEMA,
    supabaseStorageBucket: parsed.data.SUPABASE_STORAGE_BUCKET,
    outputStorageMode: parsed.data.OUTPUT_STORAGE_MODE,
    localArtifactDir: parsed.data.LOCAL_ARTIFACT_DIR,
    sourceFetchInsecureTls: parsed.data.SOURCE_FETCH_INSECURE_TLS,
  };

  return cachedConfig;
}
