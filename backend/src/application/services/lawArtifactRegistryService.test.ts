import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from '../../db/memory/index.js';
import { sourceRegistry } from '../../infrastructure/catalog/sourceRegistry.js';
import { sha256 } from '../../utils.js';
import { LawArtifactRegistryService } from './lawArtifactRegistryService.js';

describe('LawArtifactRegistryService', () => {
  it('reuses an existing canonical law version when the normalized law content is unchanged', async () => {
    const repos = createInMemoryRepositories();
    await repos.sourceRepository.ensureSourceCatalog(sourceRegistry.list());

    const firstTaskId = await repos.runRepository.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: true }],
    });
    const secondTaskId = await repos.runRepository.createRun({
      sourceId: 'moj-laws',
      targets: [{ kind: 'law', label: '民法', query: '民法', exactMatch: true }],
    });

    const firstTask = await repos.runRepository.getRunDetail(firstTaskId);
    const secondTask = await repos.runRepository.getRunDetail(secondTaskId);
    if (!firstTask || !secondTask) {
      throw new Error('Expected both in-memory tasks to exist.');
    }

    const storageWrites: string[] = [];
    const storage = {
      async writeJson(params: { artifactKind: string; baseName: string; data: unknown; metadata?: Record<string, unknown> }) {
        const content = Buffer.from(JSON.stringify(params.data, null, 2), 'utf-8');
        storageWrites.push(`${params.artifactKind}:${params.baseName}`);
        return {
          artifactKind: params.artifactKind as never,
          fileName: `${params.baseName}.json`,
          contentType: 'application/json; charset=utf-8',
          sizeBytes: content.byteLength,
          hashSha256: sha256(content),
          encoding: 'utf-8' as const,
          buffer: content,
          metadata: params.metadata ?? {},
        };
      },
      async writeMarkdown(params: { artifactKind: string; baseName: string; content: string; metadata?: Record<string, unknown> }) {
        const content = Buffer.from(params.content, 'utf-8');
        storageWrites.push(`${params.artifactKind}:${params.baseName}`);
        return {
          artifactKind: params.artifactKind as never,
          fileName: `${params.baseName}.md`,
          contentType: 'text/markdown; charset=utf-8',
          sizeBytes: content.byteLength,
          hashSha256: sha256(content),
          encoding: 'utf-8' as const,
          buffer: content,
          metadata: params.metadata ?? {},
        };
      },
    };

    const service = new LawArtifactRegistryService(repos.artifactRepository, storage);
    const lawInput = {
      sourceId: 'moj-laws' as const,
      query: '民法',
      exactMatch: true,
      lawName: '民法',
      lawLevel: '法律',
      lawUrl: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000001',
      category: '行政＞法務部＞法律事務目',
      modifiedDate: '20210120',
      effectiveDate: '99991231',
      effectiveNote: 'test effective note',
      abandonNote: '',
      hasEnglishVersion: true,
      englishName: 'Civil Code',
      sourceUpdateDate: '2026/4/10 上午 12:00:00',
      articleEntries: [
        { type: 'A', no: '第 1 條', content: '民事，法律所未規定者，依習慣；無習慣者，依法理。' },
        { type: 'A', no: '第 2 條', content: '民事所適用之習慣，以不背於公共秩序或善良風俗者為限。' },
      ],
      histories: '中華民國 110 年 1 月 20 日修正',
      documentMarkdown: '# 民法\n\n- 第 1 條：民事，法律所未規定者，依習慣；無習慣者，依法理。',
    };

    const firstResult = await service.persistRunLawArtifacts({
      runId: firstTask.id,
      workItemId: firstTask.workItems[0].id,
      ...lawInput,
    });
    const secondResult = await service.persistRunLawArtifacts({
      runId: secondTask.id,
      workItemId: secondTask.workItems[0].id,
      ...lawInput,
    });

    expect(firstResult.contentStatus).toBe('new');
    expect(secondResult.contentStatus).toBe('reused');
    expect(storageWrites).toHaveLength(4);

    const firstDetail = await repos.runRepository.getRunDetail(firstTask.id);
    const secondDetail = await repos.runRepository.getRunDetail(secondTask.id);
    if (!firstDetail || !secondDetail) {
      throw new Error('Expected persisted run details to exist.');
    }

    expect(firstDetail.artifacts).toHaveLength(4);
    expect(secondDetail.artifacts).toHaveLength(4);
    expect(new Set(firstDetail.artifacts.map((artifact) => artifact.canonicalVersionId)).size).toBe(1);
    expect(new Set(secondDetail.artifacts.map((artifact) => artifact.canonicalVersionId)).size).toBe(1);
    expect(secondDetail.artifacts.every((artifact) => artifact.contentStatus === 'reused')).toBe(true);
    expect(firstDetail.artifacts.every((artifact) => artifact.contentStatus === 'new')).toBe(true);
  });
});