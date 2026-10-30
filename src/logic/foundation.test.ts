import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rupeesToPaise, paiseToRupees, formatRupees } from './money';
import { validatePin, hashPin, verifyPin } from './pin';
import {
  setApprovalPin,
  verifyApprovalPin,
  _resetApprovalStoreForTesting,
  _seedUserForTesting,
} from './approvals';

describe('money.ts foundation tests', () => {
  it('converts rupees to paise and back correctly', () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(12.5)).toBe(1250);
    expect(rupeesToPaise(0)).toBe(0);

    expect(paiseToRupees(10000)).toBe(100);
    expect(paiseToRupees(1250)).toBe(12.5);
    expect(paiseToRupees(0)).toBe(0);
  });

  it('formats rupees in Indian numbering style', () => {
    expect(formatRupees(1240000)).toBe('Rs. 12,400');
    expect(formatRupees(1240050)).toBe('Rs. 12,400.50');
    expect(formatRupees(0)).toBe('Rs. 0');
  });
});

describe('pin.ts foundation tests', () => {
  it('rejects 3, 5 and 6 digit PINs and accepts 4 digits', () => {
    const threeDigitResult = validatePin('123');
    expect(threeDigitResult.valid).toBe(false);

    const fourDigitResult = validatePin('1234');
    expect(fourDigitResult.valid).toBe(true);

    const fiveDigitResult = validatePin('12345');
    expect(fiveDigitResult.valid).toBe(false);

    const sixDigitResult = validatePin('123456');
    expect(sixDigitResult.valid).toBe(false);

    const sevenDigitResult = validatePin('1234567');
    expect(sevenDigitResult.valid).toBe(false);
  });

  it('verifies a correct PIN and fails for a wrong PIN', async () => {
    const { hash, salt } = await hashPin('4567');
    const user = { pinHash: hash, pinSalt: salt };

    const correctVerify = await verifyPin('4567', user);
    expect(correctVerify).toBe(true);

    const wrongVerify = await verifyPin('1111', user);
    expect(wrongVerify).toBe(false);
  });
});

describe('approvals.ts Approval PIN tests', () => {
  beforeEach(() => {
    _resetApprovalStoreForTesting();
    vi.useRealTimers();
  });

  it('Approval PIN equal to Owner PIN rejected', async () => {
    const ownerPin = '1234';
    // 1. Rejected when checked against passed-in plain PINs
    const res = await setApprovalPin('1234', [ownerPin]);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Ijazat PIN Malik ya Staff PIN se alag hona chahiye');

    // 2. Rejected when Owner user exists in database
    const { hash, salt } = await hashPin(ownerPin);
    _seedUserForTesting({
      id: 'owner',
      name: 'Owner',
      role: 'owner',
      pinHash: hash,
      pinSalt: salt,
      active: true,
    });

    const resDb = await setApprovalPin('1234');
    expect(resDb.ok).toBe(false);
    expect(resDb.error).toBe('Ijazat PIN Malik ya Staff PIN se alag hona chahiye');
  });

  it('correct PIN verifies', async () => {
    const setResult = await setApprovalPin('9876', ['1234']);
    expect(setResult.ok).toBe(true);

    const verifyResult = await verifyApprovalPin('9876');
    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.status).toBe('ok');
  });

  it('3 wrong tries lock it', async () => {
    await setApprovalPin('9876', ['1234']);

    // Attempt 1: wrong
    const try1 = await verifyApprovalPin('0000');
    expect(try1.ok).toBe(false);
    expect(try1.status).toBe('wrong');
    if (try1.status === 'wrong') {
      expect(try1.triesLeft).toBe(2);
    }

    // Attempt 2: wrong
    const try2 = await verifyApprovalPin('0000');
    expect(try2.ok).toBe(false);
    expect(try2.status).toBe('wrong');
    if (try2.status === 'wrong') {
      expect(try2.triesLeft).toBe(1);
    }

    // Attempt 3: locks for 5 minutes
    const try3 = await verifyApprovalPin('0000');
    expect(try3.ok).toBe(false);
    expect(try3.status).toBe('locked');
    if (try3.status === 'locked') {
      expect(try3.minutesLeft).toBe(5);
    }

    // Even with the correct PIN, it is now locked
    const lockedTry = await verifyApprovalPin('9876');
    expect(lockedTry.ok).toBe(false);
    expect(lockedTry.status).toBe('locked');
  });

  it('the lock ends after 5 minutes', async () => {
    vi.useFakeTimers();
    await setApprovalPin('9876', ['1234']);

    // Fail 3 times to trigger lock
    await verifyApprovalPin('0000');
    await verifyApprovalPin('0000');
    const lockedRes = await verifyApprovalPin('0000');
    expect(lockedRes.status).toBe('locked');

    // Advance time by 5 minutes + 1 second
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // Now correct PIN succeeds!
    const afterLockRes = await verifyApprovalPin('9876');
    expect(afterLockRes.ok).toBe(true);
    expect(afterLockRes.status).toBe('ok');

    vi.useRealTimers();
  });
});

import { attemptUserLogin, _resetLoginLockForTesting } from './auth';

describe('auth.ts Login wait tests', () => {
  beforeEach(() => {
    _resetLoginLockForTesting();
    vi.useRealTimers();
  });

  it('5 wrong tries lock the user, lock ends after 2 minutes, and correct PIN resets', async () => {
    const { hash, salt } = await hashPin('5555');
    const user = {
      id: 'test_user_1',
      name: 'Raju',
      role: 'cashier' as const,
      pinHash: hash,
      pinSalt: salt,
      pinLength: 4,
      active: true,
    };

    // Attempts 1 to 4: wrong
    for (let i = 1; i <= 4; i++) {
      const res = await attemptUserLogin(user, '0000');
      expect(res.ok).toBe(false);
      if (!res.ok && res.status === 'wrong') {
        expect(res.attempts).toBe(i);
        expect(res.triesLeft).toBe(5 - i);
      }
    }

    // Attempt 5: locks for 2 minutes
    const res5 = await attemptUserLogin(user, '0000');
    expect(res5.ok).toBe(false);
    expect(res5.status).toBe('locked');
    if (!res5.ok && res5.status === 'locked') {
      expect(res5.minutesLeft).toBe(2);
    }

    // Trying correct PIN while locked is still rejected as locked
    const lockedTry = await attemptUserLogin(user, '5555');
    expect(lockedTry.ok).toBe(false);
    expect(lockedTry.status).toBe('locked');

    // Fast-forward 2 minutes
    vi.useFakeTimers();
    vi.advanceTimersByTime(2 * 60 * 1000 + 1000);

    // Lock has ended, correct PIN succeeds and resets count!
    const successRes = await attemptUserLogin(user, '5555');
    expect(successRes.ok).toBe(true);
    if (successRes.ok) {
      expect(successRes.user.name).toBe('Raju');
    }

    // Subsequent wrong attempt starts back at 1 failed attempt, not 5
    const nextWrong = await attemptUserLogin(user, '0000');
    expect(nextWrong.ok).toBe(false);
    if (!nextWrong.ok && nextWrong.status === 'wrong') {
      expect(nextWrong.attempts).toBe(1);
      expect(nextWrong.triesLeft).toBe(4);
    }

    vi.useRealTimers();
  });
});

import { capitalizeWords, toUpperAlphanumeric, filterDigits } from './format';

describe('format.ts auto-capitalization and input helpers', () => {
  it('capitalizes first letter of words, preserves uppercase, and does not capitalize after apostrophes', () => {
    expect(capitalizeWords('maa durga medical hall')).toBe('Maa Durga Medical Hall');
    expect(capitalizeWords('sunil kumar')).toBe('Sunil Kumar');
    expect(capitalizeWords("women's")).toBe("Women's");
    expect(capitalizeWords("old women's college road, near kranti hotel")).toBe(
      "Old Women's College Road, Near Kranti Hotel"
    );
    // Preserves existing uppercase
    expect(capitalizeWords('Dolo 650MG')).toBe('Dolo 650MG');
  });

  it('filters digits for phone numbers and converts GST/licence to uppercase', () => {
    expect(filterDigits('9006286255')).toBe('9006286255');
    expect(filterDigits('900-628-6255')).toBe('9006286255');
    expect(filterDigits('Phone: +91 90062 86255')).toBe('919006286255');

    expect(toUpperAlphanumeric('09aaaaa0000a1z5')).toBe('09AAAAA0000A1Z5');
    expect(toUpperAlphanumeric('up-mrt-20b/8892')).toBe('UP-MRT-20B/8892');
  });
});

