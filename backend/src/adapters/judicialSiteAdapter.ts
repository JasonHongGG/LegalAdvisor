import * as cheerio from 'cheerio';
import type { JudicialListTargetConfig } from '@legaladvisor/shared';
import type { AdapterContext, SourceAdapter } from './base.js';
import { httpClient } from '../httpClient.js';
import { normalizeWhitespace, toMarkdownHeading } from '../utils.js';

function absolutize(baseUrl: string, href: string | undefined) {
  if (!href) {
    return null;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractPageEntries(url: string, html: string) {
  const $ = cheerio.load(html);
  const rows = $('table tr').toArray();
  const entries = rows
    .map((row) => {
      const cells = $(row).find('td');
      const anchor = $(row).find('a').first();
      const title = normalizeWhitespace(anchor.text() || cells.eq(1).text() || '');
      if (!title) {
        return null;
      }
      const link = absolutize(url, anchor.attr('href'));
      const date = normalizeWhitespace(cells.last().text());
      return {
        title,
        link,
        date: date || null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const nextLink = $('a')
    .filter((_, element) => normalizeWhitespace($(element).text()) === '下一頁')
    .first()
    .attr('href');

  return {
    entries,
    nextPageUrl: absolutize(url, nextLink),
  };
}

function extractDetailContent(url: string, html: string) {
  const $ = cheerio.load(html);
  const candidates = ['main', '#maincontent', '.cp', '.content', '.page-content', 'article'];
  for (const selector of candidates) {
    const text = normalizeWhitespace($(selector).text());
    if (text) {
      return text;
    }
  }
  return normalizeWhitespace($('body').text()) || `無法自 ${url} 提取主要內容。`;
}

export class JudicialSiteAdapter implements SourceAdapter {
  readonly sourceId = 'judicial-sites' as const;

  async run(context: AdapterContext) {
    const target = context.target as JudicialListTargetConfig;
    const items: Array<{ title: string; link: string | null; date: string | null; content: string }> = [];
    let currentUrl: string | null = target.startUrl;
    let page = 0;

    await context.beginStage('fetching_index', {
      progress: 5,
      message: '開始抓取司法院列表頁',
      sourceLocator: target.startUrl,
      itemsProcessed: 0,
      itemsTotal: 0,
    });

    while (currentUrl && page < target.maxPages) {
      page += 1;
      await context.emit('info', 'work-item-status', `抓取列表頁 ${page}`, { url: currentUrl });
      const pageResponse = await httpClient.get(currentUrl, { insecureTls: true });
      const { entries, nextPageUrl } = extractPageEntries(currentUrl, pageResponse.text());
      await context.beginStage('fetching_detail', {
        progress: Math.min(30 + page * 10, 60),
        message: `列表頁 ${page} 找到 ${entries.length} 筆候選資料`,
        cursor: { page, currentUrl, nextPageUrl },
      });

      for (const entry of entries) {
        if (!entry.link) {
          continue;
        }
        const detailResponse = await httpClient.get(entry.link, { insecureTls: true });
        items.push({
          ...entry,
          content: extractDetailContent(entry.link, detailResponse.text()),
        });
        await context.advance({
          itemsProcessed: items.length,
          itemsTotal: items.length,
          message: `已抓取 ${entry.title}`,
          sourceLocator: entry.link,
        });
      }

      currentUrl = nextPageUrl;
    }

    const payload = {
      schemaVersion: '1.0.0',
      source: this.sourceId,
      startUrl: target.startUrl,
      crawledPages: page,
      items,
    };
    const markdown = [
      toMarkdownHeading(1, target.label),
      '',
      `- 起始網址：${target.startUrl}`,
      `- 抓取頁數：${page}`,
      `- 資料筆數：${items.length}`,
      '',
      ...items.flatMap((item) => [
        toMarkdownHeading(2, item.title),
        '',
        `- 日期：${item.date ?? '未提供'}`,
        `- 連結：${item.link ?? '未提供'}`,
        '',
        item.content,
        '',
      ]),
    ].join('\n');

    await context.beginStage('writing_output', {
      progress: 85,
      message: '寫入補充資料快照中',
      itemsTotal: items.length,
      itemsProcessed: items.length,
    });
    await context.writeJsonArtifact('judicial_site_snapshot', `${target.label}-snapshot`, payload, {
      pages: page,
      items: items.length,
    });
    await context.writeMarkdownArtifact('judicial_site_markdown', `${target.label}-summary`, markdown, {
      pages: page,
      items: items.length,
    });
    await context.complete({
      message: `完成 ${items.length} 筆司法院補充資料輸出`,
      itemsProcessed: items.length,
      itemsTotal: items.length,
    });
  }
}
