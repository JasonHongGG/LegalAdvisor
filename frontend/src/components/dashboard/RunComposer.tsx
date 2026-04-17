import type { SourceOverviewDto } from '@legaladvisor/shared';
import { CirclePlay, FileText, Info } from 'lucide-react';
import { clsx } from 'clsx';
import styles from './RunComposer.module.css';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ScrollableRail } from '../ui/ScrollableRail';
import { Tooltip } from '../ui/Tooltip';
import type { FieldValue } from '../../features/crawler/domain/types';

type RunComposerProps = {
  source: SourceOverviewDto | null;
  formValues: Record<string, FieldValue>;
  isSubmitting: boolean;
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

export function RunComposer({
  source,
  formValues,
  isSubmitting,
  onSubmit,
  onFieldChange,
}: RunComposerProps) {
  const exactMatchField = source?.runBuilderFields.find((field) => field.name === 'exactMatch') ?? null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <FileText size={18} />
          <h2>建立任務</h2>
        </div>
      </div>

      {!source ? (
        <div className={styles.empty}>目前還沒有可用來源。</div>
      ) : (
        <form className={styles.form} onSubmit={onSubmit}>
          {source.runBuilderFields
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
                  {source.id === 'moj-laws' && field.name === 'query' && (
                    <ScrollableRail
                      orientation="horizontal"
                      className={styles.tagRail}
                      draggingClassName={styles.tagRailDragging}
                      contentClassName={styles.tagList}
                      enableDrag
                    >
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
                    </ScrollableRail>
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

              <Button type="submit" variant="primary" icon={<CirclePlay size={18} />} disabled={isSubmitting || !source}>
                {isSubmitting ? '建立中...' : '建立並開始執行'}
              </Button>
            </div>
        </form>
      )}
    </div>
  );
}
