import cors from 'cors';
import express from 'express';
import { createSourceRouter } from './routes/sources.js';
import { createTaskRouter } from './routes/tasks.js';
import type { EventBus } from './services/eventBus.js';
import type { TaskService } from './services/taskService.js';
import { createAttachmentDisposition } from './utils.js';

export function createApp(taskService: TaskService, eventBus: EventBus) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use('/api/sources', createSourceRouter(taskService));
  app.use('/api/tasks', createTaskRouter(taskService, eventBus));
  app.get('/api/artifacts/:artifactId/download', async (request, response, next) => {
    try {
      const { artifact, buffer } = await taskService.downloadArtifact(request.params.artifactId);
      response.setHeader('Content-Type', artifact.contentType);
      response.setHeader('Content-Disposition', createAttachmentDisposition(artifact.fileName));
      response.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/artifacts/:artifactId/preview', async (request, response, next) => {
    try {
      response.json(await taskService.previewArtifact(request.params.artifactId));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;
    const message = error instanceof Error ? error.message : 'Unknown server error';
    response.status(500).json({ message });
  });

  return app;
}
