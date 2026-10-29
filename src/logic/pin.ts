/**
 * PIN security using standard Web Crypto PBKDF2 with SHA-256 and unique random salt per user.
 * PINs are NEVER stored as plain text.
 * Owner PIN must be 4-6 digits.
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Validates PIN requirements:
 * - All numeric digits
 * - 4 to 6 digits in length
 */
export function validatePin(
  pin: string,
  isOwner = false
): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(pin)) {
    return { valid: false, error: 'PIN must contain only numbers (0-9)' };
  }
  if (pin.length < 4 || pin.length > 6) {
    return {
      valid: false,
      error: isOwner
        ? 'Owner PIN must be between 4 and 6 digits'
        : 'PIN must be between 4 and 6 digits',
    };
  }
  return { valid: true };
}

/**
 * Hashes a PIN using Web Crypto PBKDF2 (100,000 iterations of SHA-256).
 * Generates a fresh random 16-byte salt if one is not provided.
 */
export async function hashPin(
  pin: string,
  providedSaltHex?: string
): Promise<{ hash: string; salt: string }> {
  const salt = providedSaltHex
    ? hexToBytes(providedSaltHex)
    : crypto.getRandomValues(new Uint8Array(16));

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(salt),
  };
}

/**
 * Verifies a candidate plain text PIN against a user's stored salt and hash.
 */
export async function verifyPin(
  pin: string,
  user: { pinHash: string; pinSalt: string }
): Promise<boolean> {
  if (!user || !user.pinHash || !user.pinSalt) {
    return false;
  }
  const { hash } = await hashPin(pin, user.pinSalt);
  return hash === user.pinHash;
}
