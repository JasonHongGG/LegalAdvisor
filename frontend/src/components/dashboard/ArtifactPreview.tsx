import { useMemo, useState } from 'react';
import type { ArtifactPreviewPayload } from '@legaladvisor/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Download, Eye, FileJson, FileText, X } from 'lucide-react';
import styles from './ArtifactPreview.module.css';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';
import { Tooltip } from '../ui/Tooltip';

type ArtifactPreviewProps = {
  open: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  preview: ArtifactPreviewPayload | null;
  onClose: () => void;
  onDownload: (artifactId: string) => void;
};

export function ArtifactPreview({ open, isLoading, errorMessage, preview, onClose, onDownload }: ArtifactPreviewProps) {
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'source'>('preview');

  const metaLabel = useMemo(() => {
    if (!preview) {
      return '';
    }

    const parts = [formatByteSize(preview.byteLength)];
    if (preview.lineCount !== null) {
      parts.push(`${preview.lineCount} 行`);
    }
    if (preview.truncated) {
      parts.push('已截斷預覽');
    }
    return parts.join(' · ');
  }, [preview]);

  return (
    <Modal open={open} onClose={onClose} className={styles.modal}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.titleRow}>
            {preview?.previewKind === 'json' ? <FileJson size={18} /> : <FileText size={18} />}
            <strong>{preview?.artifact.fileName ?? '檔案預覽'}</strong>
          </div>
          <span className={styles.meta}>{preview ? metaLabel : '讀取中'}</span>
        </div>

        <div className={styles.actions}>
          {preview && (
            <Tooltip content="下載這份檔案">
              <IconButton label="下載檔案" size="sm" onClick={() => onDownload(preview.artifact.id)}>
                <Download size={16} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip content="關閉預覽">
            <IconButton label="關閉預覽" size="sm" variant="ghost" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {preview?.previewKind === 'markdown' && preview.content && (
        <div className={styles.segmentedControl}>
          <button
            type="button"
            className={markdownMode === 'preview' ? styles.segmentActive : styles.segment}
            onClick={() => setMarkdownMode('preview')}
          >
            <Eye size={15} /> 預覽
          </button>
          <button
            type="button"
            className={markdownMode === 'source' ? styles.segmentActive : styles.segment}
            onClick={() => setMarkdownMode('source')}
          >
            <FileText size={15} /> 原文
          </button>
        </div>
      )}

      <div className={styles.body}>
        {isLoading && <div className={styles.loading}>讀取檔案內容中…</div>}
        {!isLoading && errorMessage && (
          <div className={styles.errorState}>
            <AlertTriangle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
        {!isLoading && !errorMessage && !preview && <div className={styles.emptyState}>尚未選取檔案。</div>}
        {!isLoading && !errorMessage && preview?.previewKind === 'unsupported' && (
          <div className={styles.emptyState}>這個檔案目前不支援預覽，請直接下載查看。</div>
        )}
        {!isLoading && !errorMessage && preview?.previewKind === 'json' && preview.content && (
          <pre className={styles.codeBlock}>{preview.content}</pre>
        )}
        {!isLoading && !errorMessage && preview?.previewKind === 'text' && preview.content && (
          <pre className={styles.codeBlock}>{preview.content}</pre>
        )}
        {!isLoading && !errorMessage && preview?.previewKind === 'markdown' && preview.content && markdownMode === 'source' && (
          <pre className={styles.codeBlock}>{preview.content}</pre>
        )}
        {!isLoading && !errorMessage && preview?.previewKind === 'markdown' && preview.content && markdownMode === 'preview' && (
          <div className={styles.markdownPreview}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </Modal>
  );
}

function formatByteSize(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}