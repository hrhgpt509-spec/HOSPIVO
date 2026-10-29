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
  it('rejects a PIN with 3 digits and accepts 4 to 6 digits', () => {
    const threeDigitResult = validatePin('123');
    expect(threeDigitResult.valid).toBe(false);

    const fourDigitResult = validatePin('1234');
    expect(fourDigitResult.valid).toBe(true);

    const sixDigitResult = validatePin('123456');
    expect(sixDigitResult.valid).toBe(true);

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
