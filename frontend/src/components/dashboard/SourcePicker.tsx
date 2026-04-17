import type { SourceOverviewDto } from '@legaladvisor/shared';
import { clsx } from 'clsx';
import runComposerStyles from './RunComposer.module.css';
import { formatHealthLabel } from '../../features/crawler/domain/labels';

type SourcePickerProps = {
  sources: SourceOverviewDto[];
  selectedSourceId: SourceOverviewDto['id'] | null;
  onSelectSource: (sourceId: SourceOverviewDto['id']) => void;
};

export function SourcePicker({ sources, selectedSourceId, onSelectSource }: SourcePickerProps) {
  if (sources.length === 0) {
    return <div className={runComposerStyles.empty}>目前還沒有可用來源。</div>;
  }

  return (
    <div className={runComposerStyles.sourcePicker}>
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          className={clsx(runComposerStyles.sourceOption, selectedSourceId === source.id && runComposerStyles.sourceOptionActive)}
          onClick={() => onSelectSource(source.id)}
        >
          <div className={runComposerStyles.sourceOptionTop}>
            <strong>{source.name}</strong>
            <span className={clsx(runComposerStyles.sourceStatus, runComposerStyles[`health-${source.healthStatus}`])}>{formatHealthLabel(source.healthStatus)}</span>
          </div>
          <p>{source.shortName}</p>
        </button>
      ))}
    </div>
  );
}