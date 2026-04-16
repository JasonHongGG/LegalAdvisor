import type { CrawlArtifact } from '@legaladvisor/shared';
import { Archive, Download, Eye, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ArtifactPanel.module.css';
import { IconButton } from '../ui/IconButton';
import { Tooltip } from '../ui/Tooltip';
import { api } from '../../lib/api';

type ArtifactPanelProps = {
  taskId: string;
  artifacts: CrawlArtifact[];
  activeArtifactId: string | null;
  onOpenPreview: (artifact: CrawlArtifact) => void;
};

function artifactAccentClass(artifactKind: CrawlArtifact['artifactKind']) {
  if (artifactKind.includes('markdown')) {
    return styles.markdown;
  }
  if (artifactKind.includes('manifest')) {
    return styles.manifest;
  }
  return styles.json;
}

export function ArtifactPanel({ taskId, artifacts, activeArtifactId, onOpenPreview }: ArtifactPanelProps) {
  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h4 className={styles.title}>輸出檔案</h4>
        <div className={styles.actions}>
          <Tooltip content="下載本次任務的 manifest">
            <IconButton label="下載 manifest" size="sm" disabled={artifacts.length === 0} onClick={() => window.open(api.manifestDownloadUrl(taskId), '_blank', 'noopener,noreferrer')}>
              <Download size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="下載本次任務全部輸出檔案（ZIP）">
            <IconButton label="下載全部檔案" size="sm" disabled={artifacts.length === 0} onClick={() => window.open(api.taskArchiveDownloadUrl(taskId), '_blank', 'noopener,noreferrer')}>
              <Archive size={16} />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className={styles.scroller}>
        {artifacts.length === 0 && <div className={styles.empty}>尚未輸出檔案。</div>}
        {artifacts.map((artifact) => {
          const isActive = artifact.id === activeArtifactId;
          return (
            <button
              key={artifact.id}
              type="button"
              className={clsx(styles.item, artifactAccentClass(artifact.artifactKind), isActive && styles.itemActive)}
              onClick={() => onOpenPreview(artifact)}
            >
              <div className={styles.itemMarker}>
                <FileText size={16} />
              </div>
              <div className={styles.itemBody}>
                <strong>{artifactLabel(artifact)}</strong>
                <span>{artifact.fileName}</span>
              </div>
              <span className={styles.itemAction}>
                <Eye size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function artifactLabel(artifact: CrawlArtifact) {
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