import { Router } from 'express';
import { createRunRequestSchema } from '@legaladvisor/shared';
import type { CrawlerApplicationFacade } from '../../../application/services/crawlerApplicationFacade.js';
import { createAttachmentDisposition } from '../../../utils.js';
import { validateBody } from '../middleware/validate.js';

export function createRunRouter(application: CrawlerApplicationFacade) {
  const router = Router();

  router.get('/stream', (_request, response) => {
    application.subscribeToRunStream(response);
  });

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await application.listRuns());
    } catch (error) {
      next(error);
    }
  });

  router.post('/', validateBody(createRunRequestSchema), async (request, response, next) => {
    try {
      const run = await application.createRun(request.body);
      response.status(201).json(run);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId', async (request, response, next) => {
    try {
      response.json(await application.getRunDetail(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/view', async (request, response, next) => {
    try {
      response.json(await application.getRunExecutionView(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/pause', async (request, response, next) => {
    try {
      response.json(await application.pauseRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/resume', async (request, response, next) => {
    try {
      response.json(await application.resumeRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/cancel', async (request, response, next) => {
    try {
      response.json(await application.cancelRun(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:runId', async (request, response, next) => {
    try {
      await application.deleteRun(request.params.runId);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/:runId/retry-failed', async (request, response, next) => {
    try {
      response.json(await application.retryFailedRunItems(request.params.runId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/manifest/download', async (request, response, next) => {
    try {
      const manifest = await application.downloadManifest(request.params.runId);
      response.setHeader('Content-Type', manifest.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(manifest.fileName));
      response.send(manifest.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:runId/artifacts/archive/download', async (request, response, next) => {
    try {
      const archive = await application.downloadRunArchive(request.params.runId);
      response.setHeader('Content-Type', archive.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(archive.fileName));
      response.send(archive.buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}