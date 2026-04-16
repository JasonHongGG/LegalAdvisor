import React from 'react';
import { clsx } from 'clsx';
import styles from './IconButton.module.css';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'glass' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({
  label,
  variant = 'glass',
  size = 'md',
  active = false,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(styles.button, styles[variant], styles[size], active && styles.active, className)}
      {...props}
    >
      <span className={styles.icon}>{children}</span>
    </button>
  );
}