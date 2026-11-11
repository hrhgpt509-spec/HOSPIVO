import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FullscreenButton } from './FullscreenButton';

describe('FullscreenButton', () => {
  it('renders nothing when full screen is not supported and never throws', () => {
    // When document is undefined or document.fullscreenEnabled is falsy
    const origDoc = (globalThis as unknown as { document?: Document }).document;

    try {
      // 1. Without document
      delete (globalThis as unknown as { document?: Document }).document;
      expect(() => {
        const html = renderToString(React.createElement(FullscreenButton));
        expect(html).toBe('');
      }).not.toThrow();

      // 2. With document but fullscreenEnabled false
      (globalThis as unknown as { document?: unknown }).document = {
        fullscreenEnabled: false,
        fullscreenElement: null,
      };
      expect(() => {
        const html = renderToString(React.createElement(FullscreenButton));
        expect(html).toBe('');
      }).not.toThrow();
    } finally {
      if (origDoc !== undefined) {
        (globalThis as unknown as { document: Document }).document = origDoc;
      }
    }
  });
});
