import { Router } from 'express';
import { createRunRequestSchema } from '@legaladvisor/shared';
import type { AppServices } from '../../../compositionRoot.js';
import { createAttachmentDisposition } from '../../../utils.js';
import { validateBody } from '../middleware/validate.js';

export function createRunRouter(services: Pick<AppServices, 'runCommandService' | 'runQueryService' | 'runStreamPublisher'>) {
  const { runCommandService, runQueryService, runStreamPublisher } = services;
  const router = Router();

  router.get('/stream', (_request, response) => {
    runStreamPublisher.subscribe(response);
  });

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await runQueryService.listRuns());
    } catch (error) {
      next(error);
    }
  });

  router.post('/', validateBody(createRunRequestSchema), async (request, response, next) => {
    try {
      const run = await runCommandService.createRun(request.body);
      response.status(201).json(run);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId', async (request, response, next) => {
    try {
      response.json(await runQueryService.getRunDetail(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/view', async (request, response, next) => {
    try {
      response.json(await runQueryService.getRunExecutionView(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/pause', async (request, response, next) => {
    try {
      response.json(await runCommandService.pauseRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/resume', async (request, response, next) => {
    try {
      response.json(await runCommandService.resumeRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/cancel', async (request, response, next) => {
    try {
      response.json(await runCommandService.cancelRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:runId', async (request, response, next) => {
    try {
      await runCommandService.deleteRun(request.params.runId);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/retry-failed', async (request, response, next) => {
    try {
      response.json(await runCommandService.retryFailedRunItems(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/manifest/download', async (request, response, next) => {
    try {
      const manifest = await runQueryService.downloadManifest(request.params.runId);
      response.setHeader('Content-Type', manifest.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(manifest.fileName));
      response.send(manifest.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/artifacts/archive/download', async (request, response, next) => {
    try {
      const archive = await runQueryService.downloadRunArchive(request.params.runId);
      response.setHeader('Content-Type', archive.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(archive.fileName));
      response.send(archive.buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
