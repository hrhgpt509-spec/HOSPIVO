import { useState, useEffect } from 'react';

export const COMPACT_VIEWPORT_MAX_WIDTH = 1024;

export function isCompactWidth(width: number): boolean {
  return width < COMPACT_VIEWPORT_MAX_WIDTH;
}

/**
 * Hook that returns whether the current viewport width is below 1024px
 * (Mobile & Portrait-Tablet viewports).
 * Updates on window 'resize' and 'orientationchange' events.
 */
export function useIsCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isCompactWidth(window.innerWidth);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsCompact(isCompactWidth(window.innerWidth));
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    // Initial check
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return isCompact;
}
