import type {
  ArtifactDto as CrawlArtifact,
  SourceId,
} from '@legaladvisor/shared';
import type {
  ArtifactContentRecord,
  ArtifactRepository,
  CanonicalArtifactInput,
  CanonicalLawDocumentInput,
  CanonicalLawVersionInput,
  CanonicalLawVersionMatch,
  EnsureArtifactContentInput,
  InsertArtifactInput,
  LinkedRunArtifactInput,
} from '../../application/ports/repositories.js';
import { createId } from '../../utils.js';
import { type InMemoryDataStore, type ArtifactDefinitionRecord, type RunArtifactLinkRecord, clone, nowIso } from './inMemoryDataStore.js';

export class InMemoryArtifactRepository implements ArtifactRepository {
  constructor(private readonly store: InMemoryDataStore) {}

  async ensureArtifactContent(input: EnsureArtifactContentInput) {
    const existingId = this.store.artifactContentIdsByHash.get(input.hashSha256);
    if (existingId) {
      const existing = this.store.artifactContents.get(existingId);
      if (!existing) throw new Error(`Artifact content ${existingId} not found.`);
      return {
        id: existing.id,
        hashSha256: existing.hashSha256,
        contentType: existing.contentType,
        sizeBytes: existing.sizeBytes,
        encoding: existing.encoding,
      } satisfies ArtifactContentRecord;
    }

    const record = {
      id: createId(),
      hashSha256: input.hashSha256,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      encoding: input.encoding,
      buffer: Buffer.from(input.buffer),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.store.artifactContents.set(record.id, record);
    this.store.artifactContentIdsByHash.set(record.hashSha256, record.id);
    return {
      id: record.id,
      hashSha256: record.hashSha256,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      encoding: record.encoding,
    } satisfies ArtifactContentRecord;
  }

  async insertArtifact(input: InsertArtifactInput) {
    const artifactRecord: ArtifactDefinitionRecord = {
      id: createId(),
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      canonicalDocumentId: input.canonicalDocumentId,
      canonicalVersionId: input.canonicalVersionId,
      fileName: input.fileName,
      contentId: input.contentId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      hashSha256: input.hashSha256,
      schemaVersion: input.schemaVersion,
      metadata: clone({
        ...input.metadata,
        artifactRole: input.artifactRole,
        contentStatus: input.contentStatus,
        canonicalDocumentId: input.canonicalDocumentId,
        canonicalVersionId: input.canonicalVersionId,
      }),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.store.artifactDefinitions.set(artifactRecord.id, artifactRecord);

    const link: RunArtifactLinkRecord = {
      id: input.id,
      runId: input.runId,
      workItemId: input.workItemId,
      artifactId: artifactRecord.id,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.store.runArtifactLinks.set(link.id, link);
    this.store.requireRunState(input.runId).summary.updatedAt = link.createdAt;
    return this.mapLinkedArtifact(link, artifactRecord);
  }

  async getArtifact(artifactId: string) {
    const link = this.store.runArtifactLinks.get(artifactId);
    if (link) {
      const artifact = this.store.artifactDefinitions.get(link.artifactId);
      if (!artifact) return null;
      return this.mapLinkedArtifact(link, artifact);
    }
    const canonicalArtifact = this.store.artifactDefinitions.get(artifactId);
    if (!canonicalArtifact) return null;
    return this.mapCanonicalArtifact(canonicalArtifact);
  }

  async getArtifactContent(artifactId: string) {
    const link = this.store.runArtifactLinks.get(artifactId);
    const artifactDefinition = link ? this.store.artifactDefinitions.get(link.artifactId) : this.store.artifactDefinitions.get(artifactId);
    if (!artifactDefinition) return null;
    const content = this.store.artifactContents.get(artifactDefinition.contentId);
    return content ? Buffer.from(content.buffer) : null;
  }

  async listRunArtifacts(runId: string) {
    return [...this.store.runArtifactLinks.values()]
      .filter((link) => link.runId === runId)
      .map((link) => {
        const artifact = this.store.artifactDefinitions.get(link.artifactId);
        if (!artifact) throw new Error(`Artifact definition ${link.artifactId} not found.`);
        return this.mapLinkedArtifact(link, artifact);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async ensureCanonicalLawDocument(input: CanonicalLawDocumentInput) {
    const key = `${input.sourceId}:${input.normalizedLawName}`;
    const existingId = this.store.canonicalLawDocumentKeys.get(key);
    if (existingId) {
      const existing = this.store.canonicalLawDocuments.get(existingId);
      if (!existing) throw new Error(`Canonical law document ${existingId} not found.`);
      existing.lawName = input.lawName;
      existing.englishName = input.englishName;
      existing.lawLevel = input.lawLevel;
      existing.category = input.category;
      existing.lawUrl = input.lawUrl;
      existing.updatedAt = nowIso();
      return existing.id;
    }

    const record = { ...clone(input), id: createId(), createdAt: nowIso(), updatedAt: nowIso() };
    this.store.canonicalLawDocuments.set(record.id, record);
    this.store.canonicalLawDocumentKeys.set(key, record.id);
    return record.id;
  }

  async findCanonicalLawVersion(sourceId: SourceId, normalizedLawName: string, versionFingerprint: string): Promise<CanonicalLawVersionMatch | null> {
    const lawDocumentId = this.store.canonicalLawDocumentKeys.get(`${sourceId}:${normalizedLawName}`);
    if (!lawDocumentId) return null;
    const versionId = this.store.canonicalLawVersionKeys.get(`${lawDocumentId}:${versionFingerprint}`);
    if (!versionId) return null;

    const artifacts = [...this.store.artifactDefinitions.values()]
      .filter((artifact) => artifact.canonicalVersionId === versionId)
      .map((artifact) => this.mapCanonicalArtifact(artifact));

    return { lawDocumentId, lawVersionId: versionId, versionFingerprint, artifacts };
  }

  async createCanonicalLawVersion(input: CanonicalLawVersionInput) {
    const key = `${input.lawDocumentId}:${input.versionFingerprint}`;
    const existingId = this.store.canonicalLawVersionKeys.get(key);
    if (existingId) {
      const existing = this.store.canonicalLawVersions.get(existingId);
      if (!existing) throw new Error(`Canonical law version ${existingId} not found.`);
      existing.lastSeenAt = nowIso();
      return existing.id;
    }

    const record = { ...clone(input), id: createId(), firstSeenAt: nowIso(), lastSeenAt: nowIso() };
    this.store.canonicalLawVersions.set(record.id, record);
    this.store.canonicalLawVersionKeys.set(key, record.id);
    return record.id;
  }

  async insertCanonicalArtifact(input: CanonicalArtifactInput) {
    const artifact: ArtifactDefinitionRecord = {
      id: input.id,
      artifactKind: input.artifactKind,
      artifactRole: input.artifactRole,
      canonicalDocumentId: input.lawDocumentId,
      canonicalVersionId: input.lawVersionId,
      fileName: input.fileName,
      contentId: input.contentId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      hashSha256: input.hashSha256,
      schemaVersion: input.schemaVersion,
      metadata: clone({
        ...input.metadata,
        artifactRole: input.artifactRole,
        contentStatus: 'new',
        canonicalDocumentId: input.lawDocumentId,
        canonicalVersionId: input.lawVersionId,
      }),
      createdAt: input.createdAt ?? nowIso(),
    };
    this.store.artifactDefinitions.set(artifact.id, artifact);
    return this.mapCanonicalArtifact(artifact);
  }

  async linkRunArtifact(input: LinkedRunArtifactInput) {
    const canonicalArtifact = this.store.artifactDefinitions.get(input.canonicalArtifactId);
    if (!canonicalArtifact) throw new Error(`Canonical artifact ${input.canonicalArtifactId} not found.`);

    const existing = [...this.store.runArtifactLinks.values()].find(
      (link) => link.runId === input.runId && link.workItemId === input.workItemId && link.artifactId === input.canonicalArtifactId,
    );
    if (existing) {
      existing.contentStatus = input.contentStatus;
      return this.mapLinkedArtifact(existing, canonicalArtifact);
    }

    const link: RunArtifactLinkRecord = {
      id: input.id ?? createId(),
      runId: input.runId,
      workItemId: input.workItemId,
      artifactId: input.canonicalArtifactId,
      contentStatus: input.contentStatus,
      createdAt: input.createdAt ?? nowIso(),
    };
    this.store.runArtifactLinks.set(link.id, link);
    this.store.requireRunState(input.runId).summary.updatedAt = link.createdAt;
    return this.mapLinkedArtifact(link, canonicalArtifact);
  }

  private mapLinkedArtifact(link: RunArtifactLinkRecord, artifact: ArtifactDefinitionRecord): CrawlArtifact {
    return {
      id: link.id,
      runId: link.runId,
      workItemId: link.workItemId,
      artifactKind: artifact.artifactKind,
      artifactRole: artifact.artifactRole,
      contentStatus: link.contentStatus,
      canonicalDocumentId: artifact.canonicalDocumentId,
      canonicalVersionId: artifact.canonicalVersionId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      hashSha256: artifact.hashSha256,
      schemaVersion: artifact.schemaVersion,
      metadata: clone(artifact.metadata),
      createdAt: link.createdAt,
    };
  }

  private mapCanonicalArtifact(artifact: ArtifactDefinitionRecord): CrawlArtifact {
    return {
      id: artifact.id,
      runId: `canonical:${artifact.canonicalVersionId}`,
      workItemId: null,
      artifactKind: artifact.artifactKind,
      artifactRole: artifact.artifactRole,
      contentStatus: 'new',
      canonicalDocumentId: artifact.canonicalDocumentId,
      canonicalVersionId: artifact.canonicalVersionId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      hashSha256: artifact.hashSha256,
      schemaVersion: artifact.schemaVersion,
      metadata: clone(artifact.metadata),
      createdAt: artifact.createdAt,
    };
  }
}
