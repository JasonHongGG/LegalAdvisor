import type { ArtifactDto } from '@legaladvisor/shared';
import { Archive, Download, Eye, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ArtifactPanel.module.css';
import { IconButton } from '../ui/IconButton';
import { Tooltip } from '../ui/Tooltip';
import { artifactContentStatusLabel, artifactLabel, artifactRoleLabel, artifactRoleSectionLabel } from '../../features/crawler/domain/labels';
import { api } from '../../lib/api';

type ArtifactPanelProps = {
  taskId: string;
  artifacts: ArtifactDto[];
  activeArtifactId: string | null;
  onOpenPreview: (artifact: ArtifactDto) => void;
};

function artifactAccentClass(artifactKind: ArtifactDto['artifactKind']) {
  if (artifactKind === 'law_article_snapshot' || artifactKind === 'judicial_site_snapshot' || artifactKind === 'judgment_source_snapshot') {
    return styles.machineSource;
  }
  if (artifactKind === 'law_source_snapshot') {
    return styles.provenance;
  }
  if (artifactKind === 'law_revision_snapshot') {
    return styles.versionEvidence;
  }
  if (artifactKind.includes('markdown') || artifactKind === 'judgment_document_snapshot') {
    return styles.markdown;
  }
  return styles.json;
}

const roleOrder: ArtifactDto['artifactRole'][] = ['machine-source', 'provenance', 'version-evidence', 'review-output', 'crawler-output', 'debug'];

export function ArtifactPanel({ taskId, artifacts, activeArtifactId, onOpenPreview }: ArtifactPanelProps) {
  const groupedArtifacts = roleOrder
    .map((role) => ({
      role,
      artifacts: artifacts.filter((artifact) => artifact.artifactRole === role),
    }))
    .filter((group) => group.artifacts.length > 0);

  const handleDownloadManifest = () => {
    void api.downloadManifest(taskId).catch((error) => {
      window.alert(error instanceof Error ? `下載 manifest 失敗：${error.message}` : '下載 manifest 失敗');
    });
  };

  const handleDownloadArchive = () => {
    void api.downloadTaskArchive(taskId).catch((error) => {
      window.alert(error instanceof Error ? `下載全部檔案失敗：${error.message}` : '下載全部檔案失敗');
    });
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h4 className={styles.title}>輸出檔案</h4>
        <div className={styles.actions}>
          <Tooltip content="下載本次任務的 manifest">
            <IconButton label="下載 manifest" size="sm" disabled={artifacts.length === 0} onClick={handleDownloadManifest}>
              <Download size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="下載本次任務完整輸出（含 manifest）">
            <IconButton label="下載全部檔案" size="sm" disabled={artifacts.length === 0} onClick={handleDownloadArchive}>
              <Archive size={16} />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <div className={styles.scroller}>
        {artifacts.length === 0 && <div className={styles.empty}>尚未輸出檔案。</div>}
        {groupedArtifacts.map((group) => (
          <section key={group.role} className={styles.group}>
            <div className={styles.groupHeader}>
              <strong>{artifactRoleSectionLabel(group.role)}</strong>
              <span>{group.artifacts.length} 份</span>
            </div>

            <div className={styles.groupList}>
              {group.artifacts.map((artifact) => {
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
                      <div className={styles.itemMetaRow}>
                        <span className={styles.itemBadge}>{artifactRoleLabel(artifact)}</span>
                        <span className={styles.itemBadge}>{artifactContentStatusLabel(artifact)}</span>
                      </div>
                    </div>
                    <span className={styles.itemAction}>
                      <Eye size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
