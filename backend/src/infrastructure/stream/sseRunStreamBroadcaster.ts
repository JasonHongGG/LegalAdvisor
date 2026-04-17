import crypto from 'node:crypto';
import type { Response } from 'express';
import type { RunStreamPublisher } from '../../application/ports/runtime.js';

export class SseRunStreamBroadcaster implements RunStreamPublisher {
  private readonly clients = new Map<string, Response>();

  subscribe(response: Response) {
    const clientId = crypto.randomUUID();

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    this.clients.set(clientId, response);
    this.publishTo(response, { kind: 'heartbeat', occurredAt: new Date().toISOString() });

    response.on('close', () => {
      this.clients.delete(clientId);
      response.end();
    });

    response.on('error', () => {
      this.clients.delete(clientId);
      response.end();
    });
  }

  publish(payload: Parameters<RunStreamPublisher['publish']>[0]) {
    for (const [clientId, response] of this.clients.entries()) {
      try {
        this.publishTo(response, payload);
      } catch {
        this.clients.delete(clientId);
        response.end();
      }
    }
  }

  private publishTo(response: Response, payload: Parameters<RunStreamPublisher['publish']>[0]) {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}