import cors from 'cors';
import express from 'express';
import type { CrawlerApplicationFacade } from './application/services/crawlerApplicationFacade.js';
import { errorHandler } from './presentation/http/middleware/errorHandler.js';
import { createSourceRouter } from './presentation/http/routes/sources.js';
import { createTaskRouter } from './presentation/http/routes/tasks.js';
import { createAttachmentDisposition } from './utils.js';

export function createApp(application: CrawlerApplicationFacade) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/health/deep', (_request, response) => {
    response.json({
      ok: true,
      service: 'crawler-core',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/sources', createSourceRouter(application));
  app.use('/api/tasks', createTaskRouter(application));
  app.get('/api/artifacts/:artifactId/download', async (request, response, next) => {
    try {
      const { artifact, buffer } = await application.downloadArtifact(request.params.artifactId);
      response.setHeader('Content-Type', artifact.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(artifact.fileName));
      response.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/artifacts/:artifactId/preview', async (request, response, next) => {
    try {
      response.json(await application.previewArtifact(request.params.artifactId));
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return app;
}
