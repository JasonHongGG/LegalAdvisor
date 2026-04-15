import { Router } from 'express';
import type { TaskService } from '../services/taskService.js';

export function createSourceRouter(taskService: TaskService) {
  const router = Router();

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await taskService.listSources());
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', async (_request, response, next) => {
    try {
      response.json(await taskService.refreshSources());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
