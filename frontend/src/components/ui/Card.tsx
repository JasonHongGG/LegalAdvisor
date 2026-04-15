import React from 'react';
import styles from './Card.module.css';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'glow';
}

export function Card({ children, className, variant = 'default', ...props }: CardProps) {
  return (
    <div 
      className={clsx(
        styles.card, 
        variant === 'glow' && styles.glow,
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(styles.header, className)} {...props}>{children}</div>;
}

export function CardTitle({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={clsx(styles.title, className)} {...props}>{children}</h3>;
}

export function CardContent({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(styles.content, className)} {...props}>{children}</div>;
}
