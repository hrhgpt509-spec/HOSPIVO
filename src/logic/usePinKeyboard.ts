import { useEffect } from 'react';

interface UsePinKeyboardOptions {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onEnter?: () => void;
  disabled?: boolean;
}

/**
 * Shared hook for physical keyboard support on all PIN screens.
 * - Digits from the top number row and numpad type the PIN.
 * - Backspace deletes the last digit.
 * - Escape clears (if supported).
 * - Enter confirms (if supported).
 * - Non-digit keys are completely ignored.
 * - Does not intercept keys when user is typing in standard text inputs or textareas.
 */
export function usePinKeyboard({
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  disabled = false,
}: UsePinKeyboardOptions) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      // If user is focused on a text input or textarea, let normal text editing proceed
      if (
        activeEl &&
        (activeEl.tagName === 'TEXTAREA' ||
          (activeEl.tagName === 'INPUT' && (activeEl as HTMLInputElement).type !== 'password'))
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        onDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onBackspace();
      } else if (e.key === 'Escape' && onClear) {
        e.preventDefault();
        onClear();
      } else if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter();
      }
      // Any other non-digit key is ignored
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDigit, onBackspace, onClear, onEnter, disabled]);
}
