import { InMemoryDataStore } from './inMemoryDataStore.js';
import { InMemorySourceRepository } from './inMemorySourceRepository.js';
import { InMemoryRunRepository } from './inMemoryRunRepository.js';
import { InMemoryArtifactRepository } from './inMemoryArtifactRepository.js';
import { InMemoryEventRepository } from './inMemoryEventRepository.js';
import { InMemoryStageRepository } from './inMemoryStageRepository.js';

export function createInMemoryRepositories() {
  const store = new InMemoryDataStore();
  const sourceRepository = new InMemorySourceRepository(store);
  const stageRepository = new InMemoryStageRepository(store);
  const artifactRepository = new InMemoryArtifactRepository(store);
  const eventRepository = new InMemoryEventRepository(store, stageRepository);
  const runRepository = new InMemoryRunRepository(store, artifactRepository, eventRepository, stageRepository);

  return {
    store,
    sourceRepository,
    runRepository,
    artifactRepository,
    eventRepository,
    stageRepository,
  };
}
