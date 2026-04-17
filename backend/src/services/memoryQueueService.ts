import type { RunQueuePort } from '../application/ports/runtime.js';

export class MemoryQueueService implements RunQueuePort {
  private handler: ((runId: string) => Promise<void>) | null = null;
  private started = false;
  private pendingTaskIds: string[] = [];
  private processing = Promise.resolve();

  async start(handler: (runId: string) => Promise<void>) {
    this.handler = handler;
    this.started = true;
    for (const runId of this.pendingTaskIds.splice(0)) {
      this.dispatch(runId);
    }
  }

  async enqueueTask(runId: string) {
    if (!this.started || !this.handler) {
      this.pendingTaskIds.push(runId);
      return;
    }
    this.dispatch(runId);
  }

  async stop() {
    this.started = false;
    this.handler = null;
    this.pendingTaskIds = [];
  }

  private dispatch(runId: string) {
    const handler = this.handler;
    if (!handler) {
      return;
    }

    this.processing = this.processing
      .then(() => handler(runId))
      .catch((error) => {
        console.error('Memory queue error:', error);
      });
  }
}