import type { ArtifactDto, SourceOverviewDto } from '@legaladvisor/shared';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  queued: '等待中',
  dispatching: '派送中',
  running: '執行中',
  paused: '已暫停',
  throttled: '限流中',
  completed: '已完成',
  partial_success: '部分完成',
  failed: '失敗',
  cancelled: '已取消',
  pending: '等待中',
  fetching_index: '抓取索引',
  fetching_detail: '抓取內容',
  parsing: '解析中',
  normalizing: '整理中',
  writing_output: '輸出中',
  done: '完成',
  skipped: '略過',
};

export function formatDateTime(value: string | null) {
  if (!value) {
    return '尚未更新';
  }
  return new Date(value).toLocaleString('zh-TW', { hour12: false });
}

export function formatEta(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return '系統計算中';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分`;
  }
  if (minutes > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`;
  }
  return `${remainingSeconds} 秒`;
}

export function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return '少於 1 秒';
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分 ${seconds} 秒`;
  }
  if (minutes > 0) {
    return `${minutes} 分 ${seconds} 秒`;
  }
  return `${seconds} 秒`;
}

export function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function formatHealthLabel(status: SourceOverviewDto['healthStatus']) {
  if (status === 'healthy') {
    return '正常';
  }
  if (status === 'degraded') {
    return '延遲';
  }
  if (status === 'down') {
    return '異常';
  }
  return '檢查中';
}

export function artifactLabel(artifact: ArtifactDto) {
  switch (artifact.artifactKind) {
    case 'law_source_snapshot':
      return '法規來源快照';
    case 'law_document_snapshot':
      return '法規 Markdown';
    case 'law_article_snapshot':
      return '條文 JSON';
    case 'law_revision_snapshot':
      return '沿革 JSON';
    case 'law_cross_reference_snapshot':
      return '交叉引用 JSON';
    case 'judicial_site_snapshot':
      return '司法院網站 JSON';
    case 'judicial_site_markdown':
      return '司法院網站 Markdown';
    case 'judgment_source_snapshot':
      return '裁判資料 JSON';
    case 'judgment_document_snapshot':
      return '裁判資料 Markdown';
    case 'batch_manifest':
      return '批次清單';
    default:
      return artifact.artifactKind;
  }
}