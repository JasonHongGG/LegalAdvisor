import AdmZip from 'adm-zip';
import type { LawTargetConfig } from '@legaladvisor/shared';
import type { AdapterContext, SourceAdapter } from './base.js';
import { httpClient } from '../httpClient.js';
import { normalizeWhitespace, toMarkdownHeading } from '../utils.js';

interface MojLawRecord {
  LawLevel: string;
  LawName: string;
  LawURL: string;
  LawCategory: string;
  LawModifiedDate: string;
  LawEffectiveDate: string;
  LawEffectiveNote: string;
  LawAbandonNote: string;
  LawHasEngVersion: string;
  EngLawName: string;
  LawAttachements: Array<Record<string, unknown>>;
  LawHistories: string;
  LawForeword: string;
  LawArticles: Array<{
    ArticleType: string;
    ArticleNo: string;
    ArticleContent: string;
  }>;
}

interface MojArchive {
  UpdateDate: string;
  Laws: MojLawRecord[];
}

function matchLaw(record: MojLawRecord, target: LawTargetConfig) {
  if (target.exactMatch) {
    return record.LawName === target.query;
  }
  return record.LawName.includes(target.query) || record.EngLawName?.includes(target.query);
}

function renderLawMarkdown(record: MojLawRecord) {
  const lines = [
    toMarkdownHeading(1, record.LawName),
    '',
    `- 法規類別：${record.LawCategory || '未提供'}`,
    `- 法規位階：${record.LawLevel || '未提供'}`,
    `- 最新修正日：${record.LawModifiedDate || '未提供'}`,
    `- 生效日：${record.LawEffectiveDate || '未提供'}`,
    `- 官方連結：${record.LawURL}`,
    '',
  ];

  if (record.LawForeword) {
    lines.push(toMarkdownHeading(2, '前言'), '', normalizeWhitespace(record.LawForeword), '');
  }

  if (record.LawHistories) {
    lines.push(toMarkdownHeading(2, '沿革'), '', normalizeWhitespace(record.LawHistories), '');
  }

  lines.push(toMarkdownHeading(2, '條文'), '');
  for (const article of record.LawArticles) {
    if (article.ArticleType === 'C') {
      lines.push(toMarkdownHeading(3, normalizeWhitespace(article.ArticleContent)), '');
      continue;
    }
    lines.push(`- ${article.ArticleNo || '未編號'}：${normalizeWhitespace(article.ArticleContent)}`);
  }

  lines.push('');
  return lines.join('\n');
}

export class MojLawAdapter implements SourceAdapter {
  readonly sourceId = 'moj-laws' as const;

  async run(context: AdapterContext) {
    const target = context.target as LawTargetConfig;
    await context.updateWorkItem({
      status: 'fetching_index',
      progress: 5,
      currentStage: 'fetching_index',
      lastMessage: '下載法規資料總檔中',
      sourceLocator: 'https://law.moj.gov.tw/api/ch/law/json',
      startedAt: new Date().toISOString(),
    });
    await context.emit('info', 'work-item-status', '開始下載法規資料總檔。', { query: target.query });

    const response = await httpClient.get('https://law.moj.gov.tw/api/ch/law/json', {
      insecureTls: true,
    });
    await context.incrementSourceRequestCount();

    const zip = new AdmZip(response.buffer);
    const jsonEntry = zip.getEntry('ChLaw.json');
    if (!jsonEntry) {
      throw new Error('法規總檔缺少 ChLaw.json。');
    }

    await context.updateWorkItem({
      status: 'parsing',
      progress: 25,
      currentStage: 'parsing',
      lastMessage: '解析法規資料中',
    });

    const archive = JSON.parse(zip.readAsText(jsonEntry, 'utf-8')) as MojArchive;
    const matchedLaws = archive.Laws.filter((record) => matchLaw(record, target));
    if (!matchedLaws.length) {
      throw new Error(`找不到符合「${target.query}」的法規。`);
    }

    await context.updateWorkItem({
      status: 'normalizing',
      progress: 45,
      currentStage: 'normalizing',
      lastMessage: `找到 ${matchedLaws.length} 部法規，開始輸出快照`,
      itemsTotal: matchedLaws.length,
      itemsProcessed: 0,
    });

    let processed = 0;
    for (const record of matchedLaws) {
      processed += 1;
      const baseName = `${record.LawName}-${record.LawModifiedDate || 'latest'}`;
      const sourceSnapshot = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        updateDate: archive.UpdateDate,
        law: {
          level: record.LawLevel,
          name: record.LawName,
          url: record.LawURL,
          category: record.LawCategory,
          modifiedDate: record.LawModifiedDate,
          effectiveDate: record.LawEffectiveDate,
          effectiveNote: record.LawEffectiveNote,
          abandonNote: record.LawAbandonNote,
          hasEnglishVersion: record.LawHasEngVersion === 'Y',
          englishName: record.EngLawName,
        },
      };
      const articleSnapshot = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        lawName: record.LawName,
        articles: record.LawArticles.map((article) => ({
          type: article.ArticleType,
          no: article.ArticleNo,
          content: normalizeWhitespace(article.ArticleContent),
        })),
      };
      const revisionSnapshot = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        lawName: record.LawName,
        modifiedDate: record.LawModifiedDate,
        effectiveDate: record.LawEffectiveDate,
        effectiveNote: normalizeWhitespace(record.LawEffectiveNote || ''),
        histories: normalizeWhitespace(record.LawHistories || ''),
      };
      const crossReferenceSnapshot = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        lawName: record.LawName,
        attachments: record.LawAttachements,
        lawUrl: record.LawURL,
      };

      await context.writeJsonArtifact('law_source_snapshot', `${baseName}-source`, sourceSnapshot, {
        lawName: record.LawName,
      });
      await context.writeJsonArtifact('law_article_snapshot', `${baseName}-articles`, articleSnapshot, {
        lawName: record.LawName,
      });
      await context.writeJsonArtifact('law_revision_snapshot', `${baseName}-revisions`, revisionSnapshot, {
        lawName: record.LawName,
      });
      await context.writeJsonArtifact('law_cross_reference_snapshot', `${baseName}-crossrefs`, crossReferenceSnapshot, {
        lawName: record.LawName,
      });
      await context.writeMarkdownArtifact('law_document_snapshot', `${baseName}-document`, renderLawMarkdown(record), {
        lawName: record.LawName,
      });

      await context.checkpoint('law-match-index', {
        query: target.query,
        processed,
        matchedCount: matchedLaws.length,
        latestLawName: record.LawName,
      });
      await context.updateWorkItem({
        progress: 45 + (processed / matchedLaws.length) * 45,
        itemsProcessed: processed,
        itemsTotal: matchedLaws.length,
        lastMessage: `已輸出 ${record.LawName}`,
        sourceLocator: record.LawURL,
        cursor: {
          query: target.query,
          processed,
          matchedCount: matchedLaws.length,
        },
      });
      await context.emit('info', 'artifact-emitted', `已輸出 ${record.LawName} 的法規快照。`, {
        processed,
        total: matchedLaws.length,
      });
    }

    await context.markRateLimit('normal');
    await context.updateWorkItem({
      status: 'done',
      progress: 100,
      currentStage: 'done',
      lastMessage: `完成 ${matchedLaws.length} 部法規輸出`,
      finishedAt: new Date().toISOString(),
    });
  }
}
