import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIsCompactViewport, isCompactWidth, COMPACT_VIEWPORT_MAX_WIDTH } from './useViewport';

describe('useViewport', () => {
  const origWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = {
      innerWidth: 1280,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    if (origWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = origWindow;
    }
  });

  describe('isCompactWidth', () => {
    it('defines COMPACT_VIEWPORT_MAX_WIDTH as 1024', () => {
      expect(COMPACT_VIEWPORT_MAX_WIDTH).toBe(1024);
    });

    it('returns true for widths under 1024px', () => {
      expect(isCompactWidth(360)).toBe(true);
      expect(isCompactWidth(390)).toBe(true);
      expect(isCompactWidth(768)).toBe(true);
      expect(isCompactWidth(1023)).toBe(true);
    });

    it('returns false for widths 1024px and greater', () => {
      expect(isCompactWidth(1024)).toBe(false);
      expect(isCompactWidth(1280)).toBe(false);
      expect(isCompactWidth(1920)).toBe(false);
    });
  });

  describe('useIsCompactViewport', () => {
    it('initializes to true when window.innerWidth is less than 1024px', () => {
      (globalThis as any).window.innerWidth = 390;

      let captured: boolean | null = null;
      const TestComponent = () => {
        captured = useIsCompactViewport();
        return React.createElement('div', null, String(captured));
      };

      renderToString(React.createElement(TestComponent));
      expect(captured).toBe(true);
    });

    it('initializes to false when window.innerWidth is 1024px or greater', () => {
      (globalThis as any).window.innerWidth = 1440;

      let captured: boolean | null = null;
      const TestComponent = () => {
        captured = useIsCompactViewport();
        return React.createElement('div', null, String(captured));
      };

      renderToString(React.createElement(TestComponent));
      expect(captured).toBe(false);
    });

    it('gracefully returns false when window is undefined', () => {
      delete (globalThis as any).window;

      let captured: boolean | null = null;
      const TestComponent = () => {
        captured = useIsCompactViewport();
        return React.createElement('div', null, String(captured));
      };

      renderToString(React.createElement(TestComponent));
      expect(captured).toBe(false);
    });
  });
});
