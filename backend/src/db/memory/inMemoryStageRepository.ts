import type { RunTimelineEntryDto as CrawlTimelineEntry } from '@legaladvisor/shared';
import type { InsertStageInput, StageRepository, UpdateStageInput } from '../../application/ports/repositories.js';
import { type InMemoryDataStore, nowIso } from './inMemoryDataStore.js';

export class InMemoryStageRepository implements StageRepository {
  constructor(private readonly store: InMemoryDataStore) {}

  async insertStage(input: InsertStageInput) {
    const sequenceNo = this.store.nextStageSequenceNo++;
    this.store.stages.set(input.id, {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      stageName: input.stageName,
      status: input.status,
      message: input.message ?? '',
      progress: input.progress ?? 0,
      itemsProcessed: input.itemsProcessed ?? 0,
      itemsTotal: input.itemsTotal ?? 0,
      sourceLocator: input.sourceLocator ?? null,
      sequenceNo,
      startedAt: input.startedAt ?? nowIso(),
      endedAt: null,
    });
  }

  async updateStage(stageId: string, patch: UpdateStageInput) {
    const stage = this.store.stages.get(stageId);
    if (!stage) return;
    if (patch.status !== undefined) stage.status = patch.status;
    if (patch.message !== undefined) stage.message = patch.message;
    if (patch.progress !== undefined) stage.progress = patch.progress;
    if (patch.itemsProcessed !== undefined) stage.itemsProcessed = patch.itemsProcessed;
    if (patch.itemsTotal !== undefined) stage.itemsTotal = patch.itemsTotal;
    if (patch.sourceLocator !== undefined) stage.sourceLocator = patch.sourceLocator;
    if (patch.endedAt !== undefined) stage.endedAt = patch.endedAt;
  }

  async getActiveStage(workItemId: string) {
    let latest: { id: string; stageName: string; sequenceNo: number } | null = null;
    for (const stage of this.store.stages.values()) {
      if (stage.workItemId === workItemId && stage.endedAt === null) {
        if (!latest || stage.sequenceNo > latest.sequenceNo) {
          latest = { id: stage.id, stageName: stage.stageName, sequenceNo: stage.sequenceNo };
        }
      }
    }
    return latest ? { id: latest.id, stageName: latest.stageName } : null;
  }

  async closeActiveStage(workItemId: string, endedAt: string) {
    for (const stage of this.store.stages.values()) {
      if (stage.workItemId === workItemId && stage.endedAt === null) {
        stage.status = 'completed';
        stage.endedAt = endedAt;
      }
    }
  }

  async listRunStages(runId: string): Promise<CrawlTimelineEntry[]> {
    return [...this.store.stages.values()]
      .filter((stage) => stage.runId === runId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((stage) => this.mapStageToTimelineEntry(stage));
  }

  private mapStageToTimelineEntry(stage: {
    id: string; runId: string; workItemId: string; stageName: string;
    status: string; message: string; progress: number;
    itemsProcessed: number; itemsTotal: number; sourceLocator: string | null;
    sequenceNo: number; startedAt: string; endedAt: string | null;
  }): CrawlTimelineEntry {
    let stateTone: CrawlTimelineEntry['stateTone'] = 'running';
    let stateLabel = '進行中';
    if (stage.status === 'completed') { stateTone = 'done'; stateLabel = '完成'; }
    else if (stage.status === 'failed') { stateTone = 'failed'; stateLabel = '失敗'; }

    const progressSuffix = stage.itemsTotal > 0 ? `（${stage.itemsProcessed}/${stage.itemsTotal}）` : '';

    return {
      id: stage.id,
      runId: stage.runId,
      workItemId: stage.workItemId,
      sequenceNo: stage.sequenceNo,
      eventType: 'work-item-status',
      level: stage.status === 'failed' ? 'error' : 'info',
      title: `${stage.message}${progressSuffix}`,
      context: `階段：${stage.stageName}`,
      stateLabel,
      stateTone,
      occurredAt: stage.startedAt,
      endedAt: stage.endedAt,
    };
  }
}
