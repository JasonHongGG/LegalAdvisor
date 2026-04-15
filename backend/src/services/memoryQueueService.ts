import type { QueueServicePort } from '../contracts/runtime.js';

export class MemoryQueueService implements QueueServicePort {
  private handler: ((taskId: string) => Promise<void>) | null = null;
  private started = false;
  private pendingTaskIds: string[] = [];
  private processing = Promise.resolve();

  async start(handler: (taskId: string) => Promise<void>) {
    this.handler = handler;
    this.started = true;
    for (const taskId of this.pendingTaskIds.splice(0)) {
      this.dispatch(taskId);
    }
  }

  async enqueueTask(taskId: string) {
    if (!this.started || !this.handler) {
      this.pendingTaskIds.push(taskId);
      return;
    }
    this.dispatch(taskId);
  }

  async stop() {
    this.started = false;
    this.handler = null;
    this.pendingTaskIds = [];
  }

  private dispatch(taskId: string) {
    const handler = this.handler;
    if (!handler) {
      return;
    }

    this.processing = this.processing
      .then(() => handler(taskId))
      .catch((error) => {
        console.error('Memory queue error:', error);
      });
  }
}