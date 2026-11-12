import { describe, it, expect, vi } from 'vitest';
import { handleNumpadKeyDown, type DocumentLike } from './useNumpadKeyboard';

describe('useNumpadKeyboard / handleNumpadKeyDown', () => {
  const createDoc = (
    activeTag?: string,
    hasModal = false,
    isContentEditable = false
  ): DocumentLike => ({
    activeElement: activeTag ? { tagName: activeTag, isContentEditable } : { tagName: 'BODY' },
    querySelector: () => (hasModal ? { role: 'dialog' } : null),
  });

  it('handles top-row digit keys 0-9', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const preventDefault = vi.fn();

    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const handled = handleNumpadKeyDown(
        { key: d, code: `Digit${d}`, preventDefault },
        { onDigit, onBackspace },
        createDoc('BUTTON')
      );
      expect(handled).toBe(true);
    }

    expect(onDigit).toHaveBeenCalledTimes(10);
    expect(onDigit.mock.calls.map((c) => c[0])).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(preventDefault).toHaveBeenCalledTimes(10);
  });

  it('handles Numpad digit keys 0-9', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleNumpadKeyDown(
      { key: '5', code: 'Numpad5', preventDefault },
      { onDigit, onBackspace },
      createDoc('BODY')
    );

    expect(handled).toBe(true);
    expect(onDigit).toHaveBeenCalledWith('5');
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('handles Backspace, Delete/C, and Enter', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const onClear = vi.fn();
    const onEnter = vi.fn();
    const preventDefault = vi.fn();
    const doc = createDoc('BODY');

    expect(
      handleNumpadKeyDown(
        { key: 'Backspace', preventDefault },
        { onDigit, onBackspace, onClear, onEnter },
        doc
      )
    ).toBe(true);
    expect(onBackspace).toHaveBeenCalledTimes(1);

    expect(
      handleNumpadKeyDown(
        { key: 'Delete', preventDefault },
        { onDigit, onBackspace, onClear, onEnter },
        doc
      )
    ).toBe(true);
    expect(
      handleNumpadKeyDown(
        { key: 'c', preventDefault },
        { onDigit, onBackspace, onClear, onEnter },
        doc
      )
    ).toBe(true);
    expect(onClear).toHaveBeenCalledTimes(2);

    expect(
      handleNumpadKeyDown(
        { key: 'Enter', preventDefault },
        { onDigit, onBackspace, onClear, onEnter },
        doc
      )
    ).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('ignores input when a text box, textarea, select, or contentEditable is focused', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const onClear = vi.fn();
    const onEnter = vi.fn();

    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(
        handleNumpadKeyDown(
          { key: '5' },
          { onDigit, onBackspace, onClear, onEnter },
          createDoc(tag)
        )
      ).toBe(false);
    }

    // Also ignores when event.target itself is an input or activeElement is contentEditable
    expect(
      handleNumpadKeyDown(
        { key: 'Backspace', target: { tagName: 'INPUT' } },
        { onDigit, onBackspace, onClear, onEnter },
        createDoc('BODY')
      )
    ).toBe(false);

    expect(
      handleNumpadKeyDown(
        { key: 'Enter' },
        { onDigit, onBackspace, onClear, onEnter },
        createDoc('DIV', false, true)
      )
    ).toBe(false);

    expect(onDigit).not.toHaveBeenCalled();
    expect(onBackspace).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('ignores input when disabled, modifier is held, or an overlay modal is open', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const onClear = vi.fn();
    const onEnter = vi.fn();

    // Overlay dialog open
    expect(
      handleNumpadKeyDown(
        { key: '5' },
        { onDigit, onBackspace, onClear, onEnter },
        createDoc('BODY', true)
      )
    ).toBe(false);

    // Disabled
    expect(
      handleNumpadKeyDown(
        { key: '5' },
        { onDigit, onBackspace, onClear, onEnter, disabled: true },
        createDoc('BODY')
      )
    ).toBe(false);

    // Modifier keys
    expect(
      handleNumpadKeyDown(
        { key: 'c', ctrlKey: true },
        { onDigit, onBackspace, onClear, onEnter },
        createDoc('BODY')
      )
    ).toBe(false);

    // Unrelated letter
    expect(
      handleNumpadKeyDown(
        { key: 'a' },
        { onDigit, onBackspace, onClear, onEnter },
        createDoc('BODY')
      )
    ).toBe(false);

    expect(onDigit).not.toHaveBeenCalled();
    expect(onBackspace).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });
});

