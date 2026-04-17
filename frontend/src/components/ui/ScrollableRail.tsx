import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

type ScrollableRailProps = {
  orientation: 'horizontal' | 'vertical';
  className?: string;
  draggingClassName?: string;
  contentClassName?: string;
  enableDrag?: boolean;
  children: React.ReactNode;
};

export function ScrollableRail({
  orientation,
  className,
  draggingClassName,
  contentClassName,
  enableDrag = false,
  children,
}: ScrollableRailProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isPointerDown: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    didDrag: false,
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) {
        return;
      }

      if (orientation === 'horizontal') {
        if (rail.scrollWidth <= rail.clientWidth) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        rail.scrollLeft += delta;
        return;
      }

      if (rail.scrollHeight <= rail.clientHeight) {
        return;
      }
      event.preventDefault();
      rail.scrollTop += delta;
    };

    rail.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      rail.removeEventListener('wheel', handleWheel);
    };
  }, [orientation]);

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!enableDrag || event.button !== 0 || !railRef.current) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      isPointerDown: true,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: railRef.current.scrollLeft,
      startScrollTop: railRef.current.scrollTop,
      didDrag: false,
    };
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!enableDrag || !dragStateRef.current.isPointerDown || !railRef.current) {
      return;
    }

    const distance = orientation === 'horizontal'
      ? event.clientX - dragStateRef.current.startX
      : event.clientY - dragStateRef.current.startY;

    if (!dragStateRef.current.didDrag && Math.abs(distance) > 4) {
      dragStateRef.current.didDrag = true;
      setIsDragging(true);
    }

    if (!dragStateRef.current.didDrag) {
      return;
    }

    if (orientation === 'horizontal') {
      railRef.current.scrollLeft = dragStateRef.current.startScrollLeft - distance;
      return;
    }

    railRef.current.scrollTop = dragStateRef.current.startScrollTop - distance;
  }

  function stopDrag() {
    if (!dragStateRef.current.isPointerDown) {
      return;
    }

    dragStateRef.current.isPointerDown = false;
    setIsDragging(false);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragStateRef.current.didDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current.didDrag = false;
  }

  return (
    <div
      ref={railRef}
      className={clsx(className, isDragging && draggingClassName)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onClickCapture={handleClickCapture}
    >
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </div>
  );
}