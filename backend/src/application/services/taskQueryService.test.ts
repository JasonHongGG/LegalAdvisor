import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import type { ArtifactDto, TaskDetailDto } from '@legaladvisor/shared';
import { TaskQueryService } from './taskQueryService.js';

function createArtifact(overrides: Partial<ArtifactDto> = {}): ArtifactDto {
  return {
    id: 'artifact-1',
    taskId: 'task-1',
    workItemId: 'work-item-1',
    artifactKind: 'law_article_snapshot',
    artifactRole: 'machine-source',
    contentStatus: 'new',
    canonicalDocumentId: 'law-doc-1',
    canonicalVersionId: 'law-ver-1',
    fileName: 'civil-code-articles.json',
    contentType: 'application/json; charset=utf-8',
    sizeBytes: 32,
    hashSha256: 'hash-1',
    schemaVersion: '1.0.0',
    metadata: {},
    createdAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  };
}

function createTaskDetail(artifacts: ArtifactDto[]): TaskDetailDto {
  return {
    id: 'task-1',
    sourceId: 'moj-laws',
    sourceName: '法務部全國法規資料庫',
    status: 'completed',
    summary: 'completed',
    overallProgress: 100,
    targetCount: 1,
    totalWorkItems: 1,
    completedWorkItems: 1,
    failedWorkItems: 0,
    queuedWorkItems: 0,
    runningWorkItems: 0,
    warningCount: 0,
    errorCount: 0,
    startedAt: '2026-04-16T00:00:00.000Z',
    finishedAt: '2026-04-16T00:05:00.000Z',
    updatedAt: '2026-04-16T00:05:00.000Z',
    lastEventAt: '2026-04-16T00:05:00.000Z',
    etaSeconds: null,
    targets: [{ id: 'target-1', taskId: 'task-1', targetKind: 'law', label: '民法', config: { kind: 'law', label: '民法', query: '民法', exactMatch: true }, createdAt: '2026-04-16T00:00:00.000Z' }],
    workItems: [{
      id: 'work-item-1',
      taskId: 'task-1',
      taskTargetId: 'target-1',
      sequenceNo: 1,
      label: '民法',
      status: 'done',
      progress: 100,
      currentStage: 'done',
      sourceLocator: null,
      cursor: null,
      lastMessage: 'done',
      retryCount: 0,
      warningCount: 0,
      errorCount: 0,
      itemsProcessed: 1,
      itemsTotal: 1,
      startedAt: '2026-04-16T00:00:00.000Z',
      finishedAt: '2026-04-16T00:05:00.000Z',
      updatedAt: '2026-04-16T00:05:00.000Z',
      artifacts,
      recentEvents: [],
    }],
    recentEvents: [],
    artifacts,
    manifest: {
      schemaVersion: '1.0.0',
      taskId: 'task-1',
      sourceId: 'moj-laws',
      sourceName: '法務部全國法規資料庫',
      generatedAt: '2026-04-16T00:05:00.000Z',
      targets: [{ id: 'target-1', label: '民法', targetKind: 'law' }],
      counts: { artifacts: artifacts.length, success: 1, failed: 0, skipped: 0, warnings: 0 },
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.artifactKind,
        role: artifact.artifactRole,
        contentStatus: artifact.contentStatus,
        canonicalDocumentId: artifact.canonicalDocumentId,
        canonicalVersionId: artifact.canonicalVersionId,
        fileName: artifact.fileName,
        hashSha256: artifact.hashSha256,
      })),
      failures: [],
    },
  };
}

describe('TaskQueryService', () => {
  it('packages a single manifest at archive root and uses role-based folders for artifacts', async () => {
    const artifacts = [
      createArtifact(),
      createArtifact({
        id: 'artifact-2',
        artifactKind: 'law_document_snapshot',
        artifactRole: 'review-output',
        fileName: 'civil-code.md',
        contentType: 'text/markdown; charset=utf-8',
        contentStatus: 'reused',
      }),
    ];

    const taskRepository = {
      listTaskSummaries: async () => [],
      getTaskDetail: async () => createTaskDetail(artifacts),
    };
    const artifactRepository = {
      getArtifact: async () => null,
      async getArtifactContent(artifactId: string) {
        return Buffer.from(`payload:${artifactId}`, 'utf-8');
      },
    };

    const service = new TaskQueryService(taskRepository as never, artifactRepository as never);
    const archive = await service.downloadTaskArchive('task-1');
    const zip = new AdmZip(archive.buffer);
    const entryNames = zip.getEntries().map((entry) => entry.entryName).sort();

    expect(entryNames).toContain('task-task-1-manifest.json');
    expect(entryNames).toContain('machine-source/law_article_snapshot/civil-code-articles.json');
    expect(entryNames).toContain('review-output/law_document_snapshot/civil-code.md');
    expect(entryNames.some((entryName) => entryName.startsWith('manifest/'))).toBe(false);
    expect(entryNames.some((entryName) => entryName.startsWith('artifacts/'))).toBe(false);
  });
});