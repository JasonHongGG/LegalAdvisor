import type { RunTargetConfig } from '@legaladvisor/shared';
import type { SourceAdapterResolver } from '../../adapters/base.js';
import { AdapterRateLimitError, AdapterTransientError, getErrorMessage, NotFoundError } from '../../domain/errors.js';
import { isRunExecutionBlocked, isRunnableWorkItemStatus } from '../../domain/runPolicy.js';
import type { SourceRepository, RunRepository } from '../ports/repositories.js';
import type { RunActivityService } from './runActivityService.js';
import type { RunExecutionContextFactory } from '../factories/runExecutionContextFactory.js';
import type { RunLifecycleService } from './runLifecycleService.js';

export class RunExecutionService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly runActivityService: RunActivityService,
    private readonly contextFactory: RunExecutionContextFactory,
    private readonly runLifecycleService: RunLifecycleService,
    private readonly adapterResolver: SourceAdapterResolver,
  ) {}

  async processRun(runId: string) {
    const run = await this.requireRun(runId);
    if (isRunExecutionBlocked(run.status)) {
      return;
    }

    await this.runLifecycleService.setRunStatus(runId, 'running', {
      summary: '工作器執行中',
      eventMessage: '工作器開始執行任務。',
    });

    const source = await this.sourceRepository.getSourceById(run.sourceId);
    if (!source) {
      throw new NotFoundError(`Source ${run.sourceId} not found`, { sourceId: run.sourceId });
    }

    const adapter = this.adapterResolver.get(run.sourceId);

    for (const workItem of run.workItems.filter((item) => isRunnableWorkItemStatus(item.status))) {
      const latestStatus = await this.runRepository.getRunStatus(runId);
      if (!latestStatus || isRunExecutionBlocked(latestStatus)) {
        break;
      }

      await this.processWorkItem(run, workItem.id, source, adapter);
    }

    await this.runLifecycleService.recomputeRun(runId);
  }

  private async processWorkItem(
    run: Awaited<ReturnType<RunExecutionService['requireRun']>>,
    workItemId: string,
    source: Awaited<ReturnType<SourceRepository['getSourceById']>>,
    adapter: ReturnType<SourceAdapterResolver['get']>,
  ) {
    const workItem = run.workItems.find((entry) => entry.id === workItemId);
    if (!workItem) {
      throw new NotFoundError('Work item not found', { runId: run.id, workItemId });
    }

    const target = run.targets.find((entry) => entry.id === workItem.runTargetId)?.config as RunTargetConfig | undefined;
    if (!target) {
      await this.failWorkItem(run.id, workItem.id, '找不到對應的 target 設定。');
      return;
    }

    if (!source) {
      throw new NotFoundError(`Source ${run.sourceId} not found`, { sourceId: run.sourceId });
    }

    const executionContext = await this.contextFactory.create({
      run,
      workItem,
      source,
      target,
    });

    try {
      await this.runAdapterWithRetry(adapter, executionContext, 3);
    } catch (error) {
      const failureMessage = error instanceof AdapterRateLimitError ? error.message : getErrorMessage(error);
      await this.failWorkItem(run.id, workItem.id, failureMessage);
    } finally {
      await this.runLifecycleService.recomputeRun(run.id);
    }
  }

  private async runAdapterWithRetry(
    adapter: ReturnType<SourceAdapterResolver['get']>,
    context: Awaited<ReturnType<RunExecutionContextFactory['create']>>,
    maxAttempts: number,
  ) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await adapter.run(context);
        return;
      } catch (error) {
        if (error instanceof AdapterTransientError && attempt < maxAttempts) {
          const delayMs = 1000 * 2 ** (attempt - 1);
          await context.reporting.emit('warning', 'log', `暫時性錯誤，${delayMs / 1000}s 後重試 (${attempt}/${maxAttempts}): ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
      }
    }
  }

  private async failWorkItem(runId: string, workItemId: string, message: string) {
    const run = await this.requireRun(runId);
    const workItem = run.workItems.find((entry) => entry.id === workItemId);

    await this.runRepository.updateWorkItem(workItemId, {
      status: 'failed',
      current_stage: 'failed',
      last_message: message,
      error_count: (workItem?.errorCount ?? 0) + 1,
      finished_at: new Date().toISOString(),
    });
    await this.runActivityService.appendRunEvent(runId, workItemId, 'work-item-status', 'error', message);
  }

  private async requireRun(runId: string) {
    const run = await this.runRepository.getRunDetail(runId);
    if (!run) {
      throw new NotFoundError('Run not found', { runId });
    }
    return run;
  }
}