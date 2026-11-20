import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerBackHandler,
  handleAndroidBackPress,
  getBackHandlerCount,
  clearBackHandlers,
} from './androidBack';

describe('androidBack LIFO back-button stack', () => {
  beforeEach(() => {
    clearBackHandlers();
  });

  it('returns false when no handlers are registered', () => {
    expect(getBackHandlerCount()).toBe(0);
    expect(handleAndroidBackPress()).toBe(false);
  });

  it('invokes handlers in LIFO order (modal closes before underlying screen)', () => {
    const events: string[] = [];
    const unregScreen = registerBackHandler(() => {
      events.push('screen');
    });
    const unregSheet = registerBackHandler(() => {
      events.push('sheet');
    });
    const unregModal = registerBackHandler(() => {
      events.push('modal');
    });

    expect(getBackHandlerCount()).toBe(3);

    // First back press closes the top-most modal
    expect(handleAndroidBackPress()).toBe(true);
    expect(events).toEqual(['modal']);
    unregModal();

    // Second back press closes the sheet
    expect(handleAndroidBackPress()).toBe(true);
    expect(events).toEqual(['modal', 'sheet']);
    unregSheet();

    // Third back press navigates back from the screen
    expect(handleAndroidBackPress()).toBe(true);
    expect(events).toEqual(['modal', 'sheet', 'screen']);
    unregScreen();

    // Stack is now empty -> root screen allows app exit/minimize
    expect(handleAndroidBackPress()).toBe(false);
  });

  it('falls through to lower handler when a top handler returns false', () => {
    const parentSpy = vi.fn();
    registerBackHandler(parentSpy);
    registerBackHandler(() => false);

    expect(handleAndroidBackPress()).toBe(true);
    expect(parentSpy).toHaveBeenCalledTimes(1);
  });
});
