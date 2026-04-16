import { Router } from 'express';
import type { CrawlerApplicationFacade } from '../../../application/services/crawlerApplicationFacade.js';

export function createSourceRouter(application: CrawlerApplicationFacade) {
  const router = Router();

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await application.listSources());
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', async (_request, response, next) => {
    try {
      response.json(await application.refreshSources());
    } catch (error) {
      next(error);
    }
  });

  return router;
}