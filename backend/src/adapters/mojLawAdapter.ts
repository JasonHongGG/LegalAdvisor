import AdmZip from 'adm-zip';
import type { LawTargetConfig } from '@legaladvisor/shared';
import type { AdapterContext, SourceAdapter } from './base.js';
import { httpClient } from '../httpClient.js';
import { normalizeWhitespace, parseJsonText, toMarkdownHeading } from '../utils.js';

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

    const archive = parseJsonText<MojArchive>(zip.readAsText(jsonEntry, 'utf-8'));
    const matchedLaws = archive.Laws.filter((record) => matchLaw(record, target));
    if (!matchedLaws.length) {
      throw new Error(`找不到符合「${target.query}」的法規。`);
    }

    await context.updateWorkItem({
      status: 'normalizing',
      progress: 45,
      currentStage: 'normalizing',
      lastMessage: `找到 ${matchedLaws.length} 部法規，整理資料中`,
      itemsTotal: matchedLaws.length,
      itemsProcessed: 0,
    });

    await context.updateWorkItem({
      status: 'writing_output',
      progress: 55,
      currentStage: 'writing_output',
      lastMessage: `開始輸出 ${matchedLaws.length} 部法規快照`,
      itemsTotal: matchedLaws.length,
      itemsProcessed: 0,
    });

    let processed = 0;
    for (const record of matchedLaws) {
      processed += 1;
      const contentResult = await context.persistLawArtifacts({
        lawName: record.LawName,
        lawLevel: record.LawLevel,
        lawUrl: record.LawURL,
        category: record.LawCategory,
        modifiedDate: record.LawModifiedDate,
        effectiveDate: record.LawEffectiveDate,
        effectiveNote: normalizeWhitespace(record.LawEffectiveNote || ''),
        abandonNote: normalizeWhitespace(record.LawAbandonNote || ''),
        hasEnglishVersion: record.LawHasEngVersion === 'Y',
        englishName: record.EngLawName,
        sourceUpdateDate: archive.UpdateDate,
        query: target.query,
        exactMatch: target.exactMatch,
        articleEntries: record.LawArticles.map((article) => ({
          type: article.ArticleType,
          no: article.ArticleNo,
          content: normalizeWhitespace(article.ArticleContent),
        })),
        histories: normalizeWhitespace(record.LawHistories || ''),
        documentMarkdown: renderLawMarkdown(record),
      });
      await context.updateWorkItem({
        progress: 45 + (processed / matchedLaws.length) * 45,
        itemsProcessed: processed,
        itemsTotal: matchedLaws.length,
        lastMessage: contentResult.contentStatus === 'new' ? `已建立 ${record.LawName} 新版本` : `已重用 ${record.LawName} 既有版本`,
        sourceLocator: record.LawURL,
        cursor: {
          query: target.query,
          processed,
          matchedCount: matchedLaws.length,
        },
      });
      await context.emit('info', 'artifact-emitted', `已完成 ${record.LawName} 的法規版本處理。`, {
        processed,
        total: matchedLaws.length,
        contentStatus: contentResult.contentStatus,
      });
    }

    await context.updateWorkItem({
      status: 'done',
      progress: 100,
      currentStage: 'done',
      lastMessage: `完成 ${matchedLaws.length} 部法規輸出`,
      finishedAt: new Date().toISOString(),
    });
  }
}
