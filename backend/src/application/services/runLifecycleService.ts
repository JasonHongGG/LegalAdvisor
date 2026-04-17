import type { EventLevel, RunStatus } from '@legaladvisor/shared';
import type { RunRepository } from '../ports/repositories.js';
import type { RunExecutionReporter } from '../ports/runtime.js';

const RUN_STATUS_MESSAGES: Record<RunStatus, string> = {
  draft: '任務草稿已建立。',
  queued: '任務已排入佇列。',
  dispatching: '任務已開始派發。',
  running: '工作器開始執行任務。',
  paused: '已收到暫停指令。',
  completed: '任務已完成。',
  partial_success: '任務已完成，但部分項目失敗。',
  failed: '任務執行失敗。',
  cancelled: '已收到取消指令，工作器會在安全點停止。',
};

function runStatusLevel(status: RunStatus): EventLevel {
  return status === 'failed' ? 'error' : status === 'cancelled' ? 'warning' : 'info';
}

export class RunLifecycleService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runActivityReporter: RunExecutionReporter,
  ) {}

  async setRunStatus(
    runId: string,
    status: RunStatus,
    options?: {
      summary?: string;
      eventMessage?: string;
      eventLevel?: EventLevel;
      eventDetails?: Record<string, unknown>;
    },
  ) {
    await this.runRepository.setRunStatus(runId, status, options?.summary);
    await this.runActivityReporter.appendRunEvent(
      runId,
      null,
      'run-status',
      options?.eventLevel ?? runStatusLevel(status),
      options?.eventMessage ?? RUN_STATUS_MESSAGES[status],
      {
        status,
        summary: options?.summary ?? null,
        ...(options?.eventDetails ?? {}),
      },
    );
    this.runActivityReporter.publishRunOverviewUpdated(runId);
  }

  async recomputeRun(runId: string) {
    const previousRun = await this.runRepository.getRunSummary(runId);
    await this.runRepository.recomputeRunStats(runId);
    const nextRun = await this.runRepository.getRunSummary(runId);

    if (!nextRun) {
      return null;
    }

    if (!previousRun || previousRun.status !== nextRun.status) {
      await this.runActivityReporter.appendRunEvent(
        runId,
        null,
        'run-status',
        runStatusLevel(nextRun.status),
        RUN_STATUS_MESSAGES[nextRun.status],
        {
          status: nextRun.status,
          summary: nextRun.summary,
        },
      );
    }

    this.runActivityReporter.publishRunOverviewUpdated(runId);
    return nextRun;
  }

  publishRunRemoved(runId: string) {
    this.runActivityReporter.publishRunRemoved(runId);
  }

  publishRunCreated(runId: string) {
    this.runActivityReporter.publishRunCreated(runId);
  }
}