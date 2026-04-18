import { Router } from 'express';
import type { AppServices } from '../../../compositionRoot.js';

export function createSourceRouter({ sourceCatalogService }: Pick<AppServices, 'sourceCatalogService'>) {
  const router = Router();

  router.get('/', async (_request, response, next) => {
    try {
      response.json(await sourceCatalogService.listSources());
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', async (_request, response, next) => {
    try {
      response.json(await sourceCatalogService.refreshSources());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
