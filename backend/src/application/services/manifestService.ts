import type { ArtifactRepository, TaskRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort } from '../ports/runtime.js';
import type { TaskDetailDto } from '@legaladvisor/shared';
import { createId } from '../../utils.js';

export class ManifestService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
  ) {}

  async persistManifest(task: TaskDetailDto) {
    if (!task.manifest) {
      return;
    }

    const stored = await this.artifactStorage.writeJson({
      sourceId: task.sourceId,
      taskId: task.id,
      workItemId: null,
      artifactKind: 'batch_manifest',
      baseName: `task-${task.id}-manifest`,
      data: task.manifest,
      metadata: {
        sourceId: task.sourceId,
        status: task.status,
      },
    });

    const artifactId = createId();
    await this.artifactRepository.insertArtifact({
      id: artifactId,
      taskId: task.id,
      workItemId: null,
      artifactKind: 'batch_manifest',
      fileName: stored.fileName,
      storagePath: stored.storagePath,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      hashSha256: stored.hashSha256,
      schemaVersion: '1.0.0',
      metadata: stored.metadata,
    });

    await this.taskRepository.updateTaskManifest(task.id, artifactId);
    await this.taskRepository.upsertRunSummary(task.id, artifactId, {
      successCount: task.completedWorkItems,
      failedCount: task.failedWorkItems,
      skippedCount: task.workItems.filter((item) => item.status === 'skipped').length,
      warningCount: task.warningCount,
      metadata: {
        artifactCount: task.artifacts.length + 1,
      },
    });
  }
}