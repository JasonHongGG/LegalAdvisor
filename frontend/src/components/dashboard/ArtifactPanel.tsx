import type { ArtifactDto } from '@legaladvisor/shared';
import { Archive, Download, Eye, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ArtifactPanel.module.css';
import { IconButton } from '../ui/IconButton';
import { Tooltip } from '../ui/Tooltip';
import { artifactLabel } from '../../features/crawler/domain/labels';
import { api } from '../../lib/api';

type ArtifactPanelProps = {
  taskId: string;
  artifacts: ArtifactDto[];
  activeArtifactId: string | null;
  onOpenPreview: (artifact: ArtifactDto) => void;
};

function artifactAccentClass(artifactKind: ArtifactDto['artifactKind']) {
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
