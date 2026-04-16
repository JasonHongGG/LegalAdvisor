import type { SourceOverviewDto } from '@legaladvisor/shared';
import { clsx } from 'clsx';
import taskComposerStyles from './TaskComposer.module.css';
import { formatHealthLabel } from '../../features/crawler/domain/labels';

type SourcePickerProps = {
  sources: SourceOverviewDto[];
  selectedSourceId: SourceOverviewDto['id'] | null;
  onSelectSource: (sourceId: SourceOverviewDto['id']) => void;
};

export function SourcePicker({ sources, selectedSourceId, onSelectSource }: SourcePickerProps) {
  if (sources.length === 0) {
    return <div className={taskComposerStyles.empty}>目前還沒有可用來源。</div>;
  }

  return (
    <div className={taskComposerStyles.sourcePicker}>
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          className={clsx(taskComposerStyles.sourceOption, selectedSourceId === source.id && taskComposerStyles.sourceOptionActive)}
          onClick={() => onSelectSource(source.id)}
        >
          <div className={taskComposerStyles.sourceOptionTop}>
            <strong>{source.name}</strong>
            <span className={clsx(taskComposerStyles.sourceStatus, taskComposerStyles[`health-${source.healthStatus}`])}>{formatHealthLabel(source.healthStatus)}</span>
          </div>
          <p>{source.shortName}</p>
        </button>
      ))}
    </div>
  );
}