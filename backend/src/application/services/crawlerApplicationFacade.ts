import type { Response } from 'express';
import type { RunStreamPublisher } from '../ports/runtime.js';
import type { SourceCatalogService } from './sourceCatalogService.js';
import type { RunCommandService } from './runCommandService.js';
import type { RunExecutionService } from './runExecutionService.js';
import type { RunQueryService } from './runQueryService.js';

export class CrawlerApplicationFacade {
  constructor(
    private readonly sourceCatalogService: SourceCatalogService,
    private readonly runCommandService: RunCommandService,
    private readonly runExecutionService: RunExecutionService,
    private readonly runQueryService: RunQueryService,
    private readonly runStreamPublisher: RunStreamPublisher,
  ) {}

  bootstrap() {
    return this.sourceCatalogService.bootstrap();
  }

  subscribeToRunStream(response: Response) {
    this.runStreamPublisher.subscribe(response);
  }

  listSources() {
    return this.sourceCatalogService.listSources();
  }

  refreshSources() {
    return this.sourceCatalogService.refreshSources();
  }

  listRuns() {
    return this.runQueryService.listRuns();
  }

  getRunDetail(runId: string) {
    return this.runQueryService.getRunDetail(runId);
  }

  getRunExecutionView(runId: string) {
    return this.runQueryService.getRunExecutionView(runId);
  }

  createRun(payload: unknown) {
    return this.runCommandService.createRun(payload);
  }

  pauseRun(runId: string) {
    return this.runCommandService.pauseRun(runId);
  }

  resumeRun(runId: string) {
    return this.runCommandService.resumeRun(runId);
  }

  cancelRun(runId: string) {
    return this.runCommandService.cancelRun(runId);
  }

  deleteRun(runId: string) {
    return this.runCommandService.deleteRun(runId);
  }

  retryFailedRunItems(runId: string) {
    return this.runCommandService.retryFailedRunItems(runId);
  }

  processRun(runId: string) {
    return this.runExecutionService.processRun(runId);
  }

  downloadArtifact(artifactId: string) {
    return this.runQueryService.downloadArtifact(artifactId);
  }

  previewArtifact(artifactId: string) {
    return this.runQueryService.previewArtifact(artifactId);
  }

  downloadManifest(runId: string) {
    return this.runQueryService.downloadManifest(runId);
  }

  downloadRunArchive(runId: string) {
    return this.runQueryService.downloadRunArchive(runId);
  }
}