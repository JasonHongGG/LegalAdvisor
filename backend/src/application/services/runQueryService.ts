import AdmZip from 'adm-zip';
import type { ArtifactRepository, EventRepository, RunRepository } from '../ports/repositories.js';
import { AppError, NotFoundError } from '../../domain/errors.js';
import { detectArtifactPreviewKind, parseJsonText, safeFileName, toUtf8Text } from '../../utils.js';

const MAX_ARTIFACT_PREVIEW_BYTES = 1_500_000;

export class RunQueryService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly eventRepository: EventRepository,
  ) {}

  async listRuns() {
    return this.runRepository.listRunSummaries();
  }

  async getRunDetail(runId: string) {
    return this.runRepository.getRunDetail(runId);
  }

  async getRunExecutionView(runId: string) {
    const run = await this.runRepository.getRunSummary(runId);
    if (!run) {
      throw new NotFoundError('Run not found', { runId });
    }

    const [timeline, events, artifacts] = await Promise.all([
      this.eventRepository.listRunTimelineEntries(runId, { limit: 1000 }),
      this.eventRepository.listRunEvents(runId, { limit: 1000 }),
      this.artifactRepository.listRunArtifacts(runId),
    ]);

    return {
      run,
      timeline,
      events,
      artifacts,
    };
  }

  async downloadArtifact(artifactId: string) {
    const artifact = await this.artifactRepository.getArtifact(artifactId);
    if (!artifact) {
      throw new NotFoundError('Artifact not found', { artifactId });
    }

    const buffer = await this.artifactRepository.getArtifactContent(artifactId);
    if (!buffer) {
      throw new NotFoundError('Artifact content not found', { artifactId });
    }
    return { artifact, buffer };
  }

  async downloadManifest(runId: string) {
    const run = await this.getRunOrThrow(runId);
    if (!run.manifest) {
      throw new AppError('Manifest not generated yet', 409, 'manifest_not_ready', { runId });
    }

    return {
      fileName: `run-${safeFileName(runId)}-manifest.json`,
      contentType: 'application/json; charset=utf-8',
      buffer: Buffer.from(JSON.stringify(run.manifest, null, 2), 'utf-8'),
    };
  }

  async downloadRunArchive(runId: string) {
    const run = await this.getRunOrThrow(runId);
    if (!run.artifacts.length) {
      throw new AppError('Artifacts not generated yet', 409, 'artifacts_not_ready', { runId });
    }

    const zip = new AdmZip();
    const manifest = await this.downloadManifest(runId).catch(() => null);
    if (manifest) {
      zip.addFile(manifest.fileName, manifest.buffer);
    }

    for (const artifact of run.artifacts) {
      const buffer = await this.artifactRepository.getArtifactContent(artifact.id);
      if (!buffer) {
        throw new NotFoundError('Artifact content not found', { artifactId: artifact.id });
      }
      zip.addFile(this.buildArchiveEntryPath(artifact.artifactRole, artifact.artifactKind, artifact.fileName), buffer);
    }

    return {
      fileName: `run-${safeFileName(runId)}-artifacts.zip`,
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

    const buffer = await this.artifactRepository.getArtifactContent(artifactId);
    if (!buffer) {
      throw new NotFoundError('Artifact content not found', { artifactId });
    }
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

  private async getRunOrThrow(runId: string) {
    const run = await this.runRepository.getRunDetail(runId);
    if (!run) {
      throw new NotFoundError('Run not found', { runId });
    }
    return run;
  }

  private buildArchiveEntryPath(artifactRole: string, artifactKind: string, fileName: string) {
    const roleFolder = safeFileName(artifactRole || 'files') || 'files';
    const kindFolder = safeFileName(artifactKind || 'artifact') || 'artifact';
    return `${roleFolder}/${kindFolder}/${fileName}`;
  }
}