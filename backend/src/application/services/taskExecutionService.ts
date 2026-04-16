import type { TaskTargetConfig } from '@legaladvisor/shared';
import { getAdapter } from '../../adapters/index.js';
import { AdapterRateLimitError, getErrorMessage, NotFoundError } from '../../domain/errors.js';
import { isTaskExecutionBlocked, isRunnableWorkItemStatus } from '../../domain/taskPolicy.js';
import type { SourceRepository, TaskRepository } from '../ports/repositories.js';
import type { TaskActivityService } from './taskActivityService.js';
import type { TaskExecutionContextFactory } from '../factories/taskExecutionContextFactory.js';

export class TaskExecutionService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly taskActivityService: TaskActivityService,
    private readonly contextFactory: TaskExecutionContextFactory,
  ) {}

  async processTask(taskId: string) {
    const task = await this.requireTask(taskId);
    if (isTaskExecutionBlocked(task.status)) {
      return;
    }

    await this.taskRepository.setTaskStatus(taskId, 'running', '工作器執行中');
    await this.taskActivityService.appendTaskEvent(taskId, null, 'task-status', 'info', '工作器開始執行任務。');
    this.taskActivityService.publishTaskUpdated(taskId);

    const source = await this.sourceRepository.getSourceById(task.sourceId);
    if (!source) {
      throw new NotFoundError(`Source ${task.sourceId} not found`, { sourceId: task.sourceId });
    }

    for (const workItem of task.workItems.filter((item) => isRunnableWorkItemStatus(item.status))) {
      const latestStatus = await this.taskRepository.getTaskStatus(taskId);
      if (!latestStatus || isTaskExecutionBlocked(latestStatus)) {
        break;
      }

      const target = task.targets.find((entry) => entry.id === workItem.taskTargetId)?.config as TaskTargetConfig | undefined;
      if (!target) {
        await this.failWorkItem(taskId, workItem.id, '找不到對應的 target 設定。');
        continue;
      }

      const adapter = getAdapter(task.sourceId);
      const executionContext = await this.contextFactory.create({
        task,
        workItem,
        source,
        target,
      });

      try {
        await adapter.run(executionContext);
      } catch (error) {
        const failureMessage = error instanceof AdapterRateLimitError ? error.message : getErrorMessage(error);
        await this.failWorkItem(taskId, workItem.id, failureMessage);
      } finally {
        await this.taskRepository.recomputeTaskStats(taskId);
        this.taskActivityService.publishTaskUpdated(taskId);
      }
    }

    await this.taskRepository.recomputeTaskStats(taskId);
    this.taskActivityService.publishTaskUpdated(taskId);
  }

  private async failWorkItem(taskId: string, workItemId: string, message: string) {
    const task = await this.requireTask(taskId);
    const workItem = task.workItems.find((entry) => entry.id === workItemId);

    await this.taskRepository.updateWorkItem(workItemId, {
      status: 'failed',
      current_stage: 'failed',
      last_message: message,
      error_count: (workItem?.errorCount ?? 0) + 1,
      finished_at: new Date().toISOString(),
    });
    await this.taskActivityService.appendTaskEvent(taskId, workItemId, 'work-item-status', 'error', message);
  }

  private async requireTask(taskId: string) {
    const task = await this.taskRepository.getTaskDetail(taskId);
    if (!task) {
      throw new NotFoundError('Task not found', { taskId });
    }
    return task;
  }
}