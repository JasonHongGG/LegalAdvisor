import React, { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

type TooltipSide = 'top' | 'bottom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: TooltipSide;
  offset?: number;
}

type TooltipPosition = {
  left: number;
  top: number;
};

export function Tooltip({ content, children, side = 'top', offset = 10 }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const horizontalPadding = 12;
    const centeredLeft = rect.left + rect.width / 2;
    const maxLeft = window.innerWidth - tooltipRect.width / 2 - horizontalPadding;
    const minLeft = tooltipRect.width / 2 + horizontalPadding;
    const left = Math.min(Math.max(centeredLeft, minLeft), maxLeft);
    const top = side === 'top' ? rect.top - offset : rect.bottom + offset;

    setPosition({ left, top });
  }, [open, offset, side]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleWindowChange = () => setOpen(false);
    window.addEventListener('scroll', handleWindowChange, true);
    window.addEventListener('resize', handleWindowChange);

    return () => {
      window.removeEventListener('scroll', handleWindowChange, true);
      window.removeEventListener('resize', handleWindowChange);
    };
  }, [open]);

  if (!isValidElement(children)) {
    return null;
  }

  const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  const childProps = child.props;

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.trigger}
        onMouseEnter={(event) => {
          childProps.onMouseEnter?.(event);
          setOpen(true);
        }}
        onMouseLeave={(event) => {
          childProps.onMouseLeave?.(event);
          setOpen(false);
        }}
        onFocus={(event) => {
          childProps.onFocus?.(event);
          setOpen(true);
        }}
        onBlur={(event) => {
          childProps.onBlur?.(event);
          setOpen(false);
        }}
      >
        {cloneElement(child, {
          'aria-describedby': open ? tooltipId : undefined,
        })}
      </span>
      {open && position
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className={styles.tooltip}
              data-side={side}
              style={{ left: position.left, top: position.top }}
            >
              <span className={styles.content}>{content}</span>
              <span className={styles.arrow} aria-hidden="true" />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}