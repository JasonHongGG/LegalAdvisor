import { ZodError } from 'zod';
import { createRunRequestSchema } from '@legaladvisor/shared';
import type { RunRepository } from '../ports/repositories.js';
import type { RunQueuePort } from '../ports/runtime.js';
import type { RunActivityService } from './runActivityService.js';
import type { RunLifecycleService } from './runLifecycleService.js';
import { NotFoundError, RequestValidationError } from '../../domain/errors.js';

export class RunCommandService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runQueue: RunQueuePort,
    private readonly runActivityService: RunActivityService,
    private readonly runLifecycleService: RunLifecycleService,
  ) {}

  async createRun(payload: unknown) {
    let input;
    try {
      input = createRunRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new RequestValidationError('Invalid create run payload', { issues: error.flatten() });
      }
      throw error;
    }

    const runId = await this.runRepository.createRun(input);

    const createdRun = await this.getRunOrThrow(runId);
    for (const workItem of createdRun.workItems) {
      await this.runActivityService.appendRunEvent(runId, workItem.id, 'work-item-status', 'info', workItem.lastMessage, {
        status: workItem.status,
        currentStage: workItem.currentStage,
        label: workItem.label,
      });
    }

    await this.runLifecycleService.setRunStatus(runId, 'queued', {
      summary: '任務已建立，等待工作器接手',
      eventMessage: '任務已建立，等待工作器接手。',
    });
    this.runLifecycleService.publishRunCreated(runId);
    await this.runQueue.enqueueTask(runId);
    return this.getRunOrThrow(runId);
  }

  async pauseRun(runId: string) {
    await this.getRunOrThrow(runId);
    await this.runLifecycleService.setRunStatus(runId, 'paused', {
      summary: '任務已暫停',
      eventMessage: '已收到暫停指令。',
    });
    return { runId: runId, status: 'paused' as const };
  }

  async resumeRun(runId: string) {
    await this.getRunOrThrow(runId);
    await this.runLifecycleService.setRunStatus(runId, 'queued', {
      summary: '任務已恢復，重新排入佇列',
      eventMessage: '已重新排入佇列。',
    });
    await this.runQueue.enqueueTask(runId);
    return { runId: runId, status: 'queued' as const };
  }

  async cancelRun(runId: string) {
    await this.getRunOrThrow(runId);
    await this.runLifecycleService.setRunStatus(runId, 'cancelled', {
      summary: '任務已取消',
      eventLevel: 'warning',
      eventMessage: '已收到取消指令，工作器會在安全點停止。',
    });
    return { runId: runId, status: 'cancelled' as const };
  }

  async deleteRun(runId: string) {
    const run = await this.getRunOrThrow(runId);
    if (!['completed', 'partial_success', 'failed', 'cancelled'].includes(run.status)) {
      throw new RequestValidationError('只能刪除已停止的任務；請先等待完成或先取消任務。', {
        runId,
        status: run.status,
      });
    }

    await this.runRepository.deleteRun(runId);
    this.runLifecycleService.publishRunRemoved(runId);
  }

  async retryFailedRunItems(runId: string) {
    const run = await this.getRunOrThrow(runId);
    if (!run.workItems.some((item) => item.status === 'failed')) {
      return { runId: runId, status: run.status };
    }

    await this.runRepository.resetFailedRunItems(runId);
    await this.runLifecycleService.setRunStatus(runId, 'queued', {
      summary: '失敗項目已重排佇列',
      eventMessage: '失敗 work item 已重排佇列。',
    });
    await this.runQueue.enqueueTask(runId);
    return { runId: runId, status: 'queued' as const };
  }

  private async getRunOrThrow(runId: string) {
    const run = await this.runRepository.getRunDetail(runId);
    if (!run) {
      throw new NotFoundError('Run not found', { runId });
    }
    return run;
  }
}