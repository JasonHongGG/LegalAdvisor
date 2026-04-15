import styles from './ProgressBar.module.css';
import { clsx } from 'clsx';

interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  className?: string;
}

export function ProgressBar({ progress, label, status = 'idle', className }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, progress));
  
  return (
    <div className={clsx(styles.container, className)}>
      {(label || status) && (
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
          <span className={clsx(styles.value, styles[status])}>
            {status === 'running' && '處理中... '}
            {status === 'success' && '完成 '}
            {status === 'error' && '失敗 '}
            {status === 'idle' && '等待中 '}
            {percentage}%
          </span>
        </div>
      )}
      <div className={styles.track}>
        <div 
          className={clsx(
            styles.fill, 
            status === 'running' && styles.animated,
            styles[`fill-${status}`]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
