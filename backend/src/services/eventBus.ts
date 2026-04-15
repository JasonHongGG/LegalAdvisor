import type { Response } from 'express';
import type { EventStreamPayload } from '@legaladvisor/shared';

export class EventBus {
  private clients = new Set<Response>();

  subscribe(response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write(`data: ${JSON.stringify({ kind: 'heartbeat', occurredAt: new Date().toISOString() } satisfies EventStreamPayload)}\n\n`);
    this.clients.add(response);

    response.on('close', () => {
      this.clients.delete(response);
      response.end();
    });
  }

  publish(payload: EventStreamPayload) {
    const body = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      client.write(body);
    }
  }
}
