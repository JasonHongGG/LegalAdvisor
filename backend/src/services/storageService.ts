import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ArtifactKind } from '@legaladvisor/shared';
import type { AppConfig } from '../config.js';
import { safeFileName, sha256 } from '../utils.js';

export interface StoredArtifact {
  artifactKind: ArtifactKind;
  fileName: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  hashSha256: string;
  metadata: Record<string, unknown>;
}

export class StorageService {
  private readonly client: SupabaseClient | null;

  constructor(private readonly config: AppConfig) {
    if (config.outputStorageMode === 'supabase' && config.supabaseUrl && config.supabaseServiceRole) {
      this.client = createClient(config.supabaseUrl, config.supabaseServiceRole, {
        auth: { persistSession: false },
      });
    } else {
      this.client = null;
    }
  }

  async writeJson(params: {
    sourceId: string;
    taskId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    data: unknown;
    metadata?: Record<string, unknown>;
  }) {
    const buffer = Buffer.from(JSON.stringify(params.data, null, 2), 'utf-8');
    return this.writeBuffer({
      ...params,
      extension: 'json',
      contentType: 'application/json; charset=utf-8',
      buffer,
    });
  }

  async writeMarkdown(params: {
    sourceId: string;
    taskId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.writeBuffer({
      ...params,
      extension: 'md',
      contentType: 'text/markdown; charset=utf-8',
      buffer: Buffer.from(params.content, 'utf-8'),
    });
  }

  async download(storagePath: string) {
    if (this.client) {
      const { data, error } = await this.client.storage.from(this.config.supabaseStorageBucket).download(storagePath);
      if (error) {
        throw error;
      }
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const fullPath = path.resolve(process.cwd(), this.config.localArtifactDir, storagePath);
    return fs.readFile(fullPath);
  }

  private async writeBuffer(params: {
    sourceId: string;
    taskId: string;
    workItemId: string | null;
    artifactKind: ArtifactKind;
    baseName: string;
    extension: 'json' | 'md';
    contentType: string;
    buffer: Buffer;
    metadata?: Record<string, unknown>;
  }): Promise<StoredArtifact> {
    const fileName = `${safeFileName(params.baseName)}.${params.extension}`;
    const storagePath = [
      safeFileName(params.sourceId),
      new Date().toISOString().slice(0, 10),
      params.taskId,
      params.workItemId ?? 'task',
      `${params.artifactKind}-${fileName}`,
    ].join('/');

    if (this.client) {
      const { error } = await this.client.storage.from(this.config.supabaseStorageBucket).upload(storagePath, params.buffer, {
        upsert: true,
        contentType: params.contentType,
      });
      if (error) {
        throw error;
      }
    } else {
      const fullPath = path.resolve(process.cwd(), this.config.localArtifactDir, storagePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, params.buffer);
    }

    return {
      artifactKind: params.artifactKind,
      fileName,
      storagePath,
      contentType: params.contentType,
      sizeBytes: params.buffer.byteLength,
      hashSha256: sha256(params.buffer),
      metadata: {
        ...(params.metadata ?? {}),
        storageMode: this.client ? 'supabase' : 'local',
      },
    };
  }
}
