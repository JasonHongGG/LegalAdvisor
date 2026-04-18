import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from './index.js';

describe('InMemoryStageRepository', () => {
  it('inserts a stage and retrieves it as active', async () => {
    const { stageRepository } = createInMemoryRepositories();

    await stageRepository.insertStage({
      id: 'stage-1',
      runId: 'run-1',
      workItemId: 'wi-1',
      stageName: 'fetching_index',
      status: 'running',
      message: '開始下載',
      progress: 10,
    });

    const active = await stageRepository.getActiveStage('wi-1');
    expect(active).toEqual({ id: 'stage-1', stageName: 'fetching_index' });
  });

  it('closes the active stage and returns null afterwards', async () => {
    const { stageRepository } = createInMemoryRepositories();

    await stageRepository.insertStage({
      id: 'stage-1',
      runId: 'run-1',
      workItemId: 'wi-1',
      stageName: 'fetching_index',
      status: 'running',
    });

    await stageRepository.closeActiveStage('wi-1', new Date().toISOString());
    const active = await stageRepository.getActiveStage('wi-1');
    expect(active).toBeNull();
  });

  it('updates stage fields', async () => {
    const { stageRepository } = createInMemoryRepositories();

    await stageRepository.insertStage({
      id: 'stage-1',
      runId: 'run-1',
      workItemId: 'wi-1',
      stageName: 'writing_output',
      status: 'running',
    });

    await stageRepository.updateStage('stage-1', {
      progress: 80,
      message: '輸出中',
      itemsProcessed: 5,
      itemsTotal: 10,
    });

    const entries = await stageRepository.listRunStages('run-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toContain('輸出中');
  });

  it('lists stages for a run in sequence order', async () => {
    const { stageRepository } = createInMemoryRepositories();

    await stageRepository.insertStage({ id: 's1', runId: 'run-1', workItemId: 'wi-1', stageName: 'step_a', status: 'completed' });
    await stageRepository.insertStage({ id: 's2', runId: 'run-1', workItemId: 'wi-1', stageName: 'step_b', status: 'running' });

    const entries = await stageRepository.listRunStages('run-1');
    expect(entries).toHaveLength(2);
    expect(entries[0].context).toContain('step_a');
    expect(entries[1].context).toContain('step_b');
  });
});
