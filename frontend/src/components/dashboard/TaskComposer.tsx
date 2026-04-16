import { useRef, useState } from 'react';
import type { CrawlSourceRecord } from '@legaladvisor/shared';
import { CirclePlay, FileText, Info } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './TaskComposer.module.css';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Tooltip } from '../ui/Tooltip';

type FieldValue = string | number | boolean;

type TaskComposerProps = {
  sources: CrawlSourceRecord[];
  selectedSourceId: CrawlSourceRecord['id'] | null;
  formValues: Record<string, FieldValue>;
  isSubmitting: boolean;
  onSelectSource: (sourceId: CrawlSourceRecord['id']) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFieldChange: (name: string, value: FieldValue) => void;
};

const COMMON_LAW_TAGS = [
  '民法',
  '刑法',
  '民事訴訟法',
  '刑事訴訟法',
  '行政程序法',
  '行政訴訟法',
  '強制執行法',
  '破產法',
  '消費者債務清理條例',
  '公司法',
  '商業會計法',
  '企業併購法',
  '證券交易法',
  '票據法',
  '保險法',
  '銀行法',
  '信託法',
  '勞動基準法',
  '勞工退休金條例',
  '勞工保險條例',
  '就業服務法',
  '性別平等工作法',
  '職業安全衛生法',
  '工會法',
  '團體協約法',
  '勞資爭議處理法',
  '消費者保護法',
  '公平交易法',
  '個人資料保護法',
  '著作權法',
  '專利法',
  '商標法',
  '營業秘密法',
  '土地法',
  '土地登記規則',
  '公寓大廈管理條例',
  '國家賠償法',
  '訴願法',
  '政府資訊公開法',
  '家事事件法',
  '家庭暴力防治法',
  '兒童及少年福利與權益保障法',
  '性騷擾防治法',
  '跟蹤騷擾防制法',
  '毒品危害防制條例',
  '槍砲彈藥刀械管制條例',
  '洗錢防制法',
  '證人保護法',
  '貪污治罪條例',
  '組織犯罪防制條例',
] as const;

export function TaskComposer({
  sources,
  selectedSourceId,
  formValues,
  isSubmitting,
  onSelectSource,
  onSubmit,
  onFieldChange,
}: TaskComposerProps) {
  const tagRailRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isPointerDown: false,
    startX: 0,
    startScrollLeft: 0,
    didDrag: false,
  });
  const [isTagRailDragging, setIsTagRailDragging] = useState(false);
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const exactMatchField = selectedSource?.taskBuilderFields.find((field) => field.name === 'exactMatch') ?? null;

  function handleTagRailMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !tagRailRef.current) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      isPointerDown: true,
      startX: event.clientX,
      startScrollLeft: tagRailRef.current.scrollLeft,
      didDrag: false,
    };
  }

  function handleTagRailMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragStateRef.current.isPointerDown || !tagRailRef.current) {
      return;
    }

    const distance = event.clientX - dragStateRef.current.startX;
    if (!dragStateRef.current.didDrag && Math.abs(distance) > 4) {
      dragStateRef.current.didDrag = true;
      setIsTagRailDragging(true);
    }

    if (dragStateRef.current.didDrag) {
      tagRailRef.current.scrollLeft = dragStateRef.current.startScrollLeft - distance;
    }
  }

  function stopTagRailDrag() {
    if (!dragStateRef.current.isPointerDown) {
      return;
    }

    dragStateRef.current.isPointerDown = false;
    setIsTagRailDragging(false);
  }

  function handleTagRailClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragStateRef.current.didDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current.didDrag = false;
  }

  function handleTagRailWheel(event: React.WheelEvent<HTMLDivElement>) {
    const rail = tagRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    rail.scrollLeft += delta;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <FileText size={18} />
          <h2>建立任務</h2>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className={styles.empty}>目前還沒有可用來源。</div>
      ) : (
        <>
          <div className={styles.sourcePicker}>
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={clsx(styles.sourceOption, selectedSourceId === source.id && styles.sourceOptionActive)}
                onClick={() => onSelectSource(source.id)}
              >
                <div className={styles.sourceOptionTop}>
                  <strong>{source.name}</strong>
                  <span className={clsx(styles.sourceStatus, styles[`health-${source.healthStatus}`])}>{formatHealthLabel(source.healthStatus)}</span>
                </div>
                <p>{source.shortName}</p>
              </button>
            ))}
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            {selectedSource?.taskBuilderFields
              .filter((field) => field.name !== 'exactMatch')
              .map((field) => (
                <label key={field.name} className={styles.fieldGroup}>
                  <span className={styles.fieldHeader}>
                    <span className={styles.fieldLabel}>{field.label}</span>
                    {field.description && (
                      <Tooltip content={field.description}>
                        <span>
                          <IconButton label={`${field.label} 說明`} variant="ghost" size="sm">
                            <Info size={14} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </span>
                  <input
                    className={styles.input}
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={String(formValues[field.name] ?? '')}
                    onChange={(event) => onFieldChange(field.name, event.target.value)}
                  />
                  {selectedSourceId === 'moj-laws' && field.name === 'query' && (
                    <div
                      ref={tagRailRef}
                      className={clsx(styles.tagRail, isTagRailDragging && styles.tagRailDragging)}
                      onMouseDown={handleTagRailMouseDown}
                      onMouseMove={handleTagRailMouseMove}
                      onMouseUp={stopTagRailDrag}
                      onMouseLeave={stopTagRailDrag}
                      onClickCapture={handleTagRailClickCapture}
                      onWheel={handleTagRailWheel}
                    >
                      <div className={styles.tagList}>
                        {COMMON_LAW_TAGS.map((tag) => {
                          const isActive = String(formValues.query ?? '') === tag;
                          return (
                            <button
                              key={tag}
                              type="button"
                              className={clsx(styles.tag, isActive && styles.tagActive)}
                              onClick={() => onFieldChange('query', tag)}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </label>
              ))}

            <div className={styles.actions}>
              <div className={styles.actionOptions}>
                {exactMatchField && (
                  <>
                    <button
                      type="button"
                      className={clsx(styles.compactToggle, !!formValues.exactMatch && styles.compactToggleActive)}
                      onClick={() => onFieldChange('exactMatch', !formValues.exactMatch)}
                    >
                      <span className={clsx(styles.compactTrack, !!formValues.exactMatch && styles.compactTrackActive)}>
                        <span className={clsx(styles.compactThumb, !!formValues.exactMatch && styles.compactThumbActive)} />
                      </span>
                      <span>{exactMatchField.label}</span>
                    </button>
                    {exactMatchField.description && (
                      <Tooltip content={exactMatchField.description}>
                        <span>
                          <IconButton label="精準比對說明" variant="ghost" size="sm">
                            <Info size={14} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>

              <Button type="submit" variant="primary" icon={<CirclePlay size={18} />} disabled={isSubmitting || !selectedSourceId}>
                {isSubmitting ? '建立中...' : '建立並開始執行'}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function formatHealthLabel(status: CrawlSourceRecord['healthStatus']) {
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