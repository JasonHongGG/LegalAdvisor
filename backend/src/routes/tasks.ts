import { Router } from 'express';
import type { EventBus } from '../services/eventBus.js';
import type { TaskService } from '../services/taskService.js';
import { createAttachmentDisposition } from '../utils.js';

export function createTaskRouter(taskService: TaskService, eventBus: EventBus) {
  const router = Router();

  router.get('/stream', (_request, response) => {
    eventBus.subscribe(response);
  });

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await taskService.listTasks());
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const task = await taskService.createTask(request.body);
      response.status(201).json(task);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId', async (request, response, next) => {
    try {
      response.json(await taskService.getTaskDetail(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/pause', async (request, response, next) => {
    try {
      response.json(await taskService.pauseTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/resume', async (request, response, next) => {
    try {
      response.json(await taskService.resumeTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/cancel', async (request, response, next) => {
    try {
      response.json(await taskService.cancelTask(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:taskId/retry-failed', async (request, response, next) => {
    try {
      response.json(await taskService.retryFailedItems(request.params.taskId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId/manifest/download', async (request, response, next) => {
    try {
      const manifest = await taskService.downloadManifest(request.params.taskId);
      response.setHeader('Content-Type', manifest.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(manifest.fileName));
      response.send(manifest.buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:taskId/artifacts/archive/download', async (request, response, next) => {
    try {
      const archive = await taskService.downloadTaskArchive(request.params.taskId);
      response.setHeader('Content-Type', archive.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(archive.fileName));
      response.send(archive.buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
