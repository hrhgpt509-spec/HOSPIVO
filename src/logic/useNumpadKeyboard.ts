import { useEffect } from 'react';

export interface UseNumpadKeyboardOptions {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onEnter?: () => void;
  disabled?: boolean;
}

export interface NumpadKeyEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  preventDefault?: () => void;
}

interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface DocumentLike {
  activeElement?: unknown;
  querySelector?: (selectors: string) => unknown;
}

function isEditableElement(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const candidate = el as ElementLike;
  const tag = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return candidate.isContentEditable === true;
}

/**
 * Pure keyboard event processor for numeric keypads (amounts, quantities).
 * Returns true if the key event was handled.
 */
export function handleNumpadKeyDown(
  e: NumpadKeyEventLike,
  options: UseNumpadKeyboardOptions,
  doc?: DocumentLike
): boolean {
  if (options.disabled) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;

  const targetDoc: DocumentLike | undefined =
    doc ?? (typeof document !== 'undefined' ? document : undefined);

  if (isEditableElement(targetDoc?.activeElement) || isEditableElement(e.target)) {
    return false;
  }

  // Ignore if an overlay modal dialog (e.g. ApprovalDialog, ConfirmDialog) is open
  if (
    typeof targetDoc?.querySelector === 'function' &&
    targetDoc.querySelector('[role="dialog"], [aria-modal="true"]')
  ) {
    return false;
  }

  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault?.();
    options.onDigit(e.key);
    return true;
  }

  if (e.key === 'Backspace') {
    e.preventDefault?.();
    options.onBackspace();
    return true;
  }

  if ((e.key === 'Delete' || e.key === 'c' || e.key === 'C') && options.onClear) {
    e.preventDefault?.();
    options.onClear();
    return true;
  }

  if (e.key === 'Enter' && options.onEnter) {
    e.preventDefault?.();
    options.onEnter();
    return true;
  }

  return false;
}

/**
 * Shared hook for physical keyboard support on numeric amount/quantity keypads.
 * - Top number row and Numpad 0-9 call onDigit
 * - Backspace calls onBackspace
 * - Delete or C calls onClear (if provided)
 * - Enter calls onEnter (if provided)
 * - Ignores input when <input>, <textarea>, <select>, or a modal dialog is active
 */
export function useNumpadKeyboard({
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  disabled = false,
}: UseNumpadKeyboardOptions) {
  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      handleNumpadKeyDown(e, {
        onDigit,
        onBackspace,
        onClear,
        onEnter,
        disabled,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDigit, onBackspace, onClear, onEnter, disabled]);
}

