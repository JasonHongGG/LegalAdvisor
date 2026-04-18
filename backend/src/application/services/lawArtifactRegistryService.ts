import type { SourceId } from '@legaladvisor/shared';
import type { ArtifactRepository } from '../ports/repositories.js';
import type { ArtifactStoragePort, ArtifactWriteResult } from '../ports/runtime.js';
import { createId, sha256 } from '../../utils.js';

function normalizeLawName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export class LawArtifactRegistryService {
  constructor(
    private readonly artifactRepository: ArtifactRepository,
    private readonly artifactStorage: ArtifactStoragePort,
  ) {}

  async persistRunLawArtifacts(input: {
    runId: string;
    workItemId: string;
    sourceId: SourceId;
    query: string;
    exactMatch: boolean;
    lawName: string;
    lawLevel: string;
    lawUrl: string;
    category: string;
    modifiedDate: string;
    effectiveDate: string;
    effectiveNote: string;
    abandonNote: string;
    hasEnglishVersion: boolean;
    englishName: string;
    sourceUpdateDate: string;
    articleEntries: Array<{
      type: string;
      no: string;
      content: string;
    }>;
    histories: string;
    documentMarkdown: string;
  }) {
    const normalizedLawName = normalizeLawName(input.lawName);
    const versionFingerprint = sha256(
      JSON.stringify({
        sourceId: input.sourceId,
        lawName: normalizedLawName,
        modifiedDate: input.modifiedDate || null,
        effectiveDate: input.effectiveDate || null,
        articleEntries: input.articleEntries,
      }),
    );

    const existingVersion = await this.artifactRepository.findCanonicalLawVersion(
      input.sourceId,
      normalizedLawName,
      versionFingerprint,
    );

    if (existingVersion && existingVersion.artifacts.length > 0) {
      for (const artifact of existingVersion.artifacts) {
        await this.artifactRepository.linkRunArtifact({
          runId: input.runId,
          workItemId: input.workItemId,
          lawDocumentId: existingVersion.lawDocumentId,
          lawVersionId: existingVersion.lawVersionId,
          canonicalArtifactId: artifact.id,
          contentStatus: 'reused',
        });
      }

      return {
        contentStatus: 'reused' as const,
        canonicalDocumentId: existingVersion.lawDocumentId,
        canonicalVersionId: existingVersion.lawVersionId,
      };
    }

    const lawDocumentId = await this.artifactRepository.ensureCanonicalLawDocument({
      sourceId: input.sourceId,
      lawName: input.lawName,
      normalizedLawName,
      englishName: input.englishName || null,
      lawLevel: input.lawLevel || null,
      category: input.category || null,
      lawUrl: input.lawUrl,
    });
    const lawVersionId = await this.artifactRepository.createCanonicalLawVersion({
      lawDocumentId,
      sourceId: input.sourceId,
      lawName: input.lawName,
      modifiedDate: input.modifiedDate || null,
      effectiveDate: input.effectiveDate || null,
      sourceUpdateDate: input.sourceUpdateDate || null,
      versionFingerprint,
    });

    const crawlMetadata = {
      runId: input.runId,
      workItemId: input.workItemId,
      crawledAt: new Date().toISOString(),
      matchedQuery: input.query,
      exactMatch: input.exactMatch,
    };
    const canonicalMetadata = {
      canonicalDocumentId: lawDocumentId,
      canonicalVersionId: lawVersionId,
      contentStatus: 'new' as const,
      normalizedLawName,
      versionFingerprint,
      lawName: input.lawName,
      modifiedDate: input.modifiedDate || null,
      effectiveDate: input.effectiveDate || null,
      sourceUpdateDate: input.sourceUpdateDate || null,
    };
    const baseName = `${input.lawName}-${input.modifiedDate || 'latest'}`;

    const sourceSnapshot = {
      schemaVersion: '1.0.0',
      source: input.sourceId,
      updateDate: input.sourceUpdateDate,
      crawlMetadata,
      canonicalMetadata,
      law: {
        level: input.lawLevel,
        name: input.lawName,
        url: input.lawUrl,
        category: input.category,
        modifiedDate: input.modifiedDate,
        effectiveDate: input.effectiveDate,
        effectiveNote: input.effectiveNote,
        abandonNote: input.abandonNote,
        hasEnglishVersion: input.hasEnglishVersion,
        englishName: input.englishName,
      },
    };
    const articleSnapshot = {
      schemaVersion: '1.0.0',
      source: input.sourceId,
      crawlMetadata,
      canonicalMetadata,
      lawName: input.lawName,
      articles: input.articleEntries,
    };
    const revisionSnapshot = {
      schemaVersion: '1.0.0',
      source: input.sourceId,
      crawlMetadata,
      canonicalMetadata,
      lawName: input.lawName,
      modifiedDate: input.modifiedDate,
      effectiveDate: input.effectiveDate,
      effectiveNote: input.effectiveNote,
      histories: input.histories,
    };

    await this.persistCanonicalArtifact({
      runId: input.runId,
      workItemId: input.workItemId,
      lawDocumentId,
      lawVersionId,
      artifactKind: 'law_source_snapshot',
      artifactRole: 'provenance',
      stored: await this.artifactStorage.writeJson({
        sourceId: input.sourceId,
        runId: input.runId,
        workItemId: input.workItemId,
        artifactKind: 'law_source_snapshot',
        baseName: `${baseName}-source`,
        data: sourceSnapshot,
        metadata: {
          ...canonicalMetadata,
          artifactRole: 'provenance',
        },
      }),
    });

    await this.persistCanonicalArtifact({
      runId: input.runId,
      workItemId: input.workItemId,
      lawDocumentId,
      lawVersionId,
      artifactKind: 'law_article_snapshot',
      artifactRole: 'machine-source',
      stored: await this.artifactStorage.writeJson({
        sourceId: input.sourceId,
        runId: input.runId,
        workItemId: input.workItemId,
        artifactKind: 'law_article_snapshot',
        baseName: `${baseName}-articles`,
        data: articleSnapshot,
        metadata: {
          ...canonicalMetadata,
          artifactRole: 'machine-source',
        },
      }),
    });

    await this.persistCanonicalArtifact({
      runId: input.runId,
      workItemId: input.workItemId,
      lawDocumentId,
      lawVersionId,
      artifactKind: 'law_revision_snapshot',
      artifactRole: 'version-evidence',
      stored: await this.artifactStorage.writeJson({
        sourceId: input.sourceId,
        runId: input.runId,
        workItemId: input.workItemId,
        artifactKind: 'law_revision_snapshot',
        baseName: `${baseName}-revisions`,
        data: revisionSnapshot,
        metadata: {
          ...canonicalMetadata,
          artifactRole: 'version-evidence',
        },
      }),
    });

    await this.persistCanonicalArtifact({
      runId: input.runId,
      workItemId: input.workItemId,
      lawDocumentId,
      lawVersionId,
      artifactKind: 'law_document_snapshot',
      artifactRole: 'review-output',
      stored: await this.artifactStorage.writeMarkdown({
        sourceId: input.sourceId,
        runId: input.runId,
        workItemId: input.workItemId,
        artifactKind: 'law_document_snapshot',
        baseName: `${baseName}-document`,
        content: input.documentMarkdown,
        metadata: {
          ...canonicalMetadata,
          artifactRole: 'review-output',
        },
      }),
    });

    return {
      contentStatus: 'new' as const,
      canonicalDocumentId: lawDocumentId,
      canonicalVersionId: lawVersionId,
    };
  }

  private async persistCanonicalArtifact(input: {
    runId: string;
    workItemId: string;
    lawDocumentId: string;
    lawVersionId: string;
    artifactKind: 'law_source_snapshot' | 'law_article_snapshot' | 'law_revision_snapshot' | 'law_document_snapshot';
    artifactRole: 'provenance' | 'machine-source' | 'version-evidence' | 'review-output';
    stored: ArtifactWriteResult;
  }) {
    const content = await this.artifactRepository.ensureArtifactContent({
      hashSha256: input.stored.hashSha256,
      contentType: input.stored.contentType,
      sizeBytes: input.stored.sizeBytes,
      encoding: input.stored.encoding,
      buffer: input.stored.buffer,
    });

    const canonicalArtifact = await this.artifactRepository.insertCanonicalArtifact({
      id: createId(),
      lawDocumentId: input.lawDocumentId,
      lawVersionId: input.lawVersionId,
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      fileName: input.stored.fileName,
      contentId: content.id,
      contentType: input.stored.contentType,
      sizeBytes: input.stored.sizeBytes,
      hashSha256: input.stored.hashSha256,
      schemaVersion: '1.0.0',
      metadata: input.stored.metadata,
    });

    await this.artifactRepository.linkRunArtifact({
      runId: input.runId,
      workItemId: input.workItemId,
      lawDocumentId: input.lawDocumentId,
      lawVersionId: input.lawVersionId,
      canonicalArtifactId: canonicalArtifact.id,
      contentStatus: 'new',
    });
  }
}