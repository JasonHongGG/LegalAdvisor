import type { Response } from 'express';
import type { TaskStreamPublisher } from '../ports/runtime.js';
import type { SourceCatalogService } from './sourceCatalogService.js';
import type { TaskCommandService } from './taskCommandService.js';
import type { TaskExecutionService } from './taskExecutionService.js';
import type { TaskQueryService } from './taskQueryService.js';

export class CrawlerApplicationFacade {
  constructor(
    private readonly sourceCatalogService: SourceCatalogService,
    private readonly taskCommandService: TaskCommandService,
    private readonly taskExecutionService: TaskExecutionService,
    private readonly taskQueryService: TaskQueryService,
    private readonly taskStreamPublisher: TaskStreamPublisher,
  ) {}

  bootstrap() {
    return this.sourceCatalogService.bootstrap();
  }

  subscribeToTaskStream(response: Response) {
    this.taskStreamPublisher.subscribe(response);
  }

  listSources() {
    return this.sourceCatalogService.listSources();
  }

  refreshSources() {
    return this.sourceCatalogService.refreshSources();
  }

  listTasks() {
    return this.taskQueryService.listTasks();
  }

  getTaskDetail(taskId: string) {
    return this.taskQueryService.getTaskDetail(taskId);
  }

  createTask(payload: unknown) {
    return this.taskCommandService.createTask(payload);
  }

  pauseTask(taskId: string) {
    return this.taskCommandService.pauseTask(taskId);
  }

  resumeTask(taskId: string) {
    return this.taskCommandService.resumeTask(taskId);
  }

  cancelTask(taskId: string) {
    return this.taskCommandService.cancelTask(taskId);
  }

  retryFailedItems(taskId: string) {
    return this.taskCommandService.retryFailedItems(taskId);
  }

  processTask(taskId: string) {
    return this.taskExecutionService.processTask(taskId);
  }

  downloadArtifact(artifactId: string) {
    return this.taskQueryService.downloadArtifact(artifactId);
  }

  previewArtifact(artifactId: string) {
    return this.taskQueryService.previewArtifact(artifactId);
  }

  downloadManifest(taskId: string) {
    return this.taskQueryService.downloadManifest(taskId);
  }

  downloadTaskArchive(taskId: string) {
    return this.taskQueryService.downloadTaskArchive(taskId);
  }
}