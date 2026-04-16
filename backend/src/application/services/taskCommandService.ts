import { ZodError } from 'zod';
import { createTaskRequestSchema } from '@legaladvisor/shared';
import type { TaskRepository } from '../ports/repositories.js';
import type { TaskQueuePort } from '../ports/runtime.js';
import type { TaskActivityService } from './taskActivityService.js';
import { NotFoundError, RequestValidationError } from '../../domain/errors.js';

export class TaskCommandService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskQueue: TaskQueuePort,
    private readonly taskActivityService: TaskActivityService,
  ) {}

  async createTask(payload: unknown) {
    let input;
    try {
      input = createTaskRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new RequestValidationError('Invalid create task payload', { issues: error.flatten() });
      }
      throw error;
    }

    const taskId = await this.taskRepository.createTask(input);
    await this.taskRepository.setTaskStatus(taskId, 'queued', '任務已建立，等待工作器接手');

    const createdTask = await this.getTaskOrThrow(taskId);
    for (const workItem of createdTask.workItems) {
      await this.taskActivityService.appendTaskEvent(taskId, workItem.id, 'work-item-status', 'info', workItem.lastMessage, {
        status: workItem.status,
        currentStage: workItem.currentStage,
        label: workItem.label,
      });
    }

    this.taskActivityService.publishTaskCreated(taskId);
    await this.taskQueue.enqueueTask(taskId);
    return this.getTaskOrThrow(taskId);
  }

  async pauseTask(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.taskRepository.setTaskStatus(taskId, 'paused', '任務已暫停');
    await this.taskActivityService.appendTaskEvent(taskId, null, 'task-status', 'info', '已收到暫停指令。');
    this.taskActivityService.publishTaskUpdated(taskId);
    return { taskId, status: 'paused' as const };
  }

  async resumeTask(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.taskRepository.setTaskStatus(taskId, 'queued', '任務已恢復，重新排入佇列');
    await this.taskActivityService.appendTaskEvent(taskId, null, 'task-status', 'info', '已重新排入佇列。');
    await this.taskQueue.enqueueTask(taskId);
    this.taskActivityService.publishTaskUpdated(taskId);
    return { taskId, status: 'queued' as const };
  }

  async cancelTask(taskId: string) {
    await this.getTaskOrThrow(taskId);
    await this.taskRepository.setTaskStatus(taskId, 'cancelled', '任務已取消');
    await this.taskActivityService.appendTaskEvent(taskId, null, 'task-status', 'warning', '已收到取消指令，工作器會在安全點停止。');
    this.taskActivityService.publishTaskUpdated(taskId);
    return { taskId, status: 'cancelled' as const };
  }

  async retryFailedItems(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if (!task.workItems.some((item) => item.status === 'failed')) {
      return { taskId, status: task.status };
    }

    await this.taskRepository.resetFailedWorkItems(taskId);
    await this.taskRepository.recomputeTaskStats(taskId);
    await this.taskRepository.setTaskStatus(taskId, 'queued', '失敗項目已重排佇列');
    await this.taskActivityService.appendTaskEvent(taskId, null, 'task-status', 'info', '失敗 work item 已重排佇列。');
    await this.taskQueue.enqueueTask(taskId);
    this.taskActivityService.publishTaskUpdated(taskId);
    return { taskId, status: 'queued' as const };
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.taskRepository.getTaskDetail(taskId);
    if (!task) {
      throw new NotFoundError('Task not found', { taskId });
    }
    return task;
  }
}