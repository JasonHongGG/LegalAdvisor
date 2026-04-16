import { parse } from 'csv-parse/sync';
import type { JudgmentDatasetTargetConfig } from '@legaladvisor/shared';
import type { AdapterContext, SourceAdapter } from './base.js';
import { httpClient } from '../httpClient.js';
import { normalizeWhitespace, toMarkdownHeading } from '../utils.js';

export class JudgmentDatasetAdapter implements SourceAdapter {
  readonly sourceId = 'judicial-judgments' as const;

  async run(context: AdapterContext) {
    const target = context.target as JudgmentDatasetTargetConfig;
    const url = new URL(`https://opendata.judicial.gov.tw/api/FilesetLists/${target.fileSetId}/file`);
    if (target.top) {
      url.searchParams.set('top', String(target.top));
    }
    if (target.skip) {
      url.searchParams.set('skip', String(target.skip));
    }

    await context.updateWorkItem({
      status: 'fetching_detail',
      progress: 10,
      currentStage: 'fetching_detail',
      lastMessage: '下載司法院開放資料中',
      sourceLocator: url.toString(),
      startedAt: new Date().toISOString(),
    });
    await context.emit('info', 'work-item-status', '開始下載裁判書開放資料。', { fileSetId: target.fileSetId });

    const response = await httpClient.get(url.toString(), { insecureTls: true });
    const contentType = response.headers['content-type'] ?? 'application/octet-stream';

    let normalized: unknown;
    let markdownBody = '';
    if (contentType.includes('application/json') || response.text().trim().startsWith('[') || response.text().trim().startsWith('{')) {
      const jsonData = response.json<unknown>();
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      normalized = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        fileSetId: target.fileSetId,
        itemCount: items.length,
        items,
      };
      markdownBody = [
        toMarkdownHeading(1, target.label),
        '',
        `- Fileset Id：${target.fileSetId}`,
        `- 匯入筆數：${items.length}`,
        '',
        toMarkdownHeading(2, '前 5 筆預覽'),
        '',
        '```json',
        JSON.stringify(items.slice(0, 5), null, 2),
        '```',
      ].join('\n');
      await context.updateWorkItem({ itemsTotal: items.length, itemsProcessed: items.length, progress: 70, currentStage: 'normalizing', lastMessage: `已正規化 ${items.length} 筆 JSON 資料` });
    } else if (contentType.includes('csv') || contentType.includes('text/plain')) {
      const rows = parse(response.text(), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
      normalized = {
        schemaVersion: '1.0.0',
        source: this.sourceId,
        fileSetId: target.fileSetId,
        itemCount: rows.length,
        rows,
      };
      markdownBody = [
        toMarkdownHeading(1, target.label),
        '',
        `- Fileset Id：${target.fileSetId}`,
        `- 匯入筆數：${rows.length}`,
        '',
        toMarkdownHeading(2, '前 10 筆預覽'),
        '',
        '```json',
        JSON.stringify(rows.slice(0, 10), null, 2),
        '```',
      ].join('\n');
      await context.updateWorkItem({ itemsTotal: rows.length, itemsProcessed: rows.length, progress: 70, currentStage: 'normalizing', lastMessage: `已正規化 ${rows.length} 筆 CSV 資料` });
    } else {
      throw new Error(`第一版僅支援 JSON/CSV 型 fileset，收到的 content-type 為 ${contentType}`);
    }
    await context.updateWorkItem({ status: 'writing_output', currentStage: 'writing_output', progress: 85, lastMessage: '寫入裁判資料快照中' });

    await context.writeJsonArtifact('judgment_source_snapshot', `${target.label}-dataset`, normalized, {
      fileSetId: target.fileSetId,
      contentType,
    });
    await context.writeMarkdownArtifact('judgment_document_snapshot', `${target.label}-summary`, normalizeWhitespace(markdownBody), {
      fileSetId: target.fileSetId,
      contentType,
    });
    await context.updateWorkItem({
      status: 'done',
      currentStage: 'done',
      progress: 100,
      lastMessage: '完成裁判資料輸出',
      finishedAt: new Date().toISOString(),
    });
  }
}
