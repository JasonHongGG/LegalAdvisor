import type { ArtifactKind } from '@legaladvisor/shared';
import type { ArtifactStoragePort, ArtifactWriteResult } from '../application/ports/runtime.js';
import { safeFileName, sha256 } from '../utils.js';

export type StoredArtifact = ArtifactWriteResult;

export class StorageService implements ArtifactStoragePort {
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

    return {
      artifactKind: params.artifactKind,
      fileName,
      contentType: params.contentType,
      sizeBytes: params.buffer.byteLength,
      hashSha256: sha256(params.buffer),
      encoding: 'utf-8',
      buffer: params.buffer,
      metadata: {
        ...(params.metadata ?? {}),
      },
    };
  }
}
