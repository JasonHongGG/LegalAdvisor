import { Router } from 'express';
import { createTaskRequestSchema } from '@legaladvisor/shared';
import type { CrawlerApplicationFacade } from '../../../application/services/crawlerApplicationFacade.js';
import { createAttachmentDisposition } from '../../../utils.js';
import { validateBody } from '../middleware/validate.js';

export function createTaskRouter(application: CrawlerApplicationFacade) {
  const router = Router();

  router.get('/stream', (_request, response) => {
    application.subscribeToTaskStream(response);
  });

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await application.listTasks());
    } catch (error) {
      next(error);
    }
  });

  router.post('/', validateBody(createTaskRequestSchema), async (request, response, next) => {
    try {
      const task = await application.createTask(request.body);
      response.status(201).json(task);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId', async (request, response, next) => {
    try {
      response.json(await application.getTaskDetail(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/pause', async (request, response, next) => {
    try {
      response.json(await application.pauseTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/resume', async (request, response, next) => {
    try {
      response.json(await application.resumeTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/cancel', async (request, response, next) => {
    try {
      response.json(await application.cancelTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/retry-failed', async (request, response, next) => {
    try {
      response.json(await application.retryFailedItems(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId/manifest/download', async (request, response, next) => {
    try {
      const manifest = await application.downloadManifest(request.params.taskId);
      response.setHeader('Content-Type', manifest.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(manifest.fileName));
      response.send(manifest.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId/artifacts/archive/download', async (request, response, next) => {
    try {
      const archive = await application.downloadTaskArchive(request.params.taskId);
      response.setHeader('Content-Type', archive.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(archive.fileName));
      response.send(archive.buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}