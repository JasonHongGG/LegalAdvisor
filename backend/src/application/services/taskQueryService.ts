import AdmZip from 'adm-zip';
import type { ArtifactRepository, TaskRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort } from '../ports/runtime.js';
import { AppError, NotFoundError } from '../../domain/errors.js';
import { detectArtifactPreviewKind, parseJsonText, safeFileName, toUtf8Text } from '../../utils.js';

const MAX_ARTIFACT_PREVIEW_BYTES = 1_500_000;

export class TaskQueryService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
  ) {}

  async listTasks() {
    return this.taskRepository.listTaskSummaries();
  }

  async getTaskDetail(taskId: string) {
    return this.taskRepository.getTaskDetail(taskId);
  }

  async downloadArtifact(artifactId: string) {
    const artifact = await this.artifactRepository.getArtifact(artifactId);
    if (!artifact) {
      throw new NotFoundError('Artifact not found', { artifactId });
    }

    const buffer = await this.artifactStorage.download(artifact.storagePath);
    return { artifact, buffer };
  }

  async downloadManifest(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.manifest) {
      throw new AppError('Manifest not generated yet', 409, 'manifest_not_ready', { taskId });
    }

    return {
      fileName: `task-${safeFileName(taskId)}-manifest.json`,
      contentType: 'application/json; charset=utf-8',
      buffer: Buffer.from(JSON.stringify(task.manifest, null, 2), 'utf-8'),
    };
  }

  async downloadTaskArchive(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.artifacts.length) {
      throw new AppError('Artifacts not generated yet', 409, 'artifacts_not_ready', { taskId });
    }

    const zip = new AdmZip();
    const manifest = await this.downloadManifest(taskId).catch(() => null);
    if (manifest) {
      zip.addFile(`manifest/${manifest.fileName}`, manifest.buffer);
    }

    for (const artifact of task.artifacts) {
      const buffer = await this.artifactStorage.download(artifact.storagePath);
      zip.addFile(`artifacts/${artifact.artifactKind}/${artifact.fileName}`, buffer);
    }

    return {
      fileName: `task-${safeFileName(taskId)}-artifacts.zip`,
      contentType: 'application/zip',
      buffer: zip.toBuffer(),
    };
  }

  async previewArtifact(artifactId: string) {
    const artifact = await this.artifactRepository.getArtifact(artifactId);
    if (!artifact) {
      throw new NotFoundError('Artifact not found', { artifactId });
    }

    const previewKind = detectArtifactPreviewKind(artifact.contentType, artifact.fileName);
    if (previewKind === 'unsupported') {
      return {
        artifact,
        previewKind,
        content: null,
        encoding: null,
        truncated: false,
        byteLength: artifact.sizeBytes,
        lineCount: null,
      };
    }

    const buffer = await this.artifactStorage.download(artifact.storagePath);
    const truncated = buffer.byteLength > MAX_ARTIFACT_PREVIEW_BYTES;
    const previewBuffer = truncated ? buffer.subarray(0, MAX_ARTIFACT_PREVIEW_BYTES) : buffer;
    const previewText = toUtf8Text(previewBuffer);

    let normalizedContent = previewText;
    if (previewKind === 'json' && !truncated) {
      try {
        normalizedContent = JSON.stringify(parseJsonText(previewText), null, 2);
      } catch {
        normalizedContent = previewText;
      }
    }

    return {
      artifact,
      previewKind,
      content: normalizedContent,
      encoding: 'utf-8' as const,
      truncated,
      byteLength: artifact.sizeBytes,
      lineCount: normalizedContent.length ? normalizedContent.split(/\r?\n/).length : 0,
    };
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.taskRepository.getTaskDetail(taskId);
    if (!task) {
      throw new NotFoundError('Task not found', { taskId });
    }
    return task;
  }
}