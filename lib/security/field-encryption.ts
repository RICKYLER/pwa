// Field-level encryption helpers for sensitive census data.
//
// The MSWDO app moved to a Supabase-backed data layer, so the in-memory IndexedDB
// mirror no longer holds data "at rest" on the device. The places that genuinely
// persist data outside Supabase are server-side backup files — so this utility is
// used to encrypt sensitive payloads before they are written to disk, and to
// decrypt them when read back.
//
// Format: AES-256-GCM with a 12-byte random IV per encryption. The key is derived
// from a passphrase (from an env var) with PBKDF2-SHA256. The IV is stored
// alongside the ciphertext (GCM IVs are not secret), so each field can be
// encrypted independently.
//
// Works in both the browser (Web Crypto) and modern Node (globalThis.crypto).

export interface EncryptedField {
  /** Format version. */
  v: 1;
  /** Base64url of the 12-byte IV. */
  iv: string;
  /** Base64url of the AES-256-GCM ciphertext. */
  ct: string;
}

const PBKDF2_ITERATIONS = 150_000;
const AES_IV_BYTES = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Random 16-byte salt, for generating a fresh per-store salt. */
export function generateRandomSalt(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Derive an AES-256-GCM key from a passphrase and salt.
 *
 * The salt is not secret — it only prevents rainbow-table reuse of the same
 * passphrase. Keep the passphrase itself in an environment variable.
 */
export async function deriveFieldEncryptionKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a UTF-8 string. Every call uses a fresh random IV. */
export async function encryptField(plaintext: string, key: CryptoKey): Promise<EncryptedField> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    v: 1,
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ciphertext)),
  };
}

/** Decrypt a field previously encrypted with {@link encryptField}. */
export async function decryptField(payload: EncryptedField, key: CryptoKey): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(payload.iv) },
    key,
    fromBase64Url(payload.ct),
  );
  return new TextDecoder().decode(plaintext);
}

/** Convenience: JSON-encode, encrypt, and wrap in a stable envelope shape. */
export async function encryptJson(value: unknown, key: CryptoKey): Promise<{ encrypted: true; algorithm: 'AES-256-GCM'; v: 1; iv: string; ct: string }> {
  const field = await encryptField(JSON.stringify(value), key);
  return {
    encrypted: true,
    algorithm: 'AES-256-GCM',
    v: field.v,
    iv: field.iv,
    ct: field.ct,
  };
}

/**
 * Decrypt a value produced by {@link encryptJson}, returning the original JSON
 * value. Throws if the value was not encrypted by this module.
 */
export async function decryptJson(
  value: unknown,
  key: CryptoKey,
): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('encrypted' in value) || value.encrypted !== true) {
    throw new Error('Not an encrypted envelope.');
  }

  const envelope = value as { v?: unknown; iv?: unknown; ct?: unknown };
  const raw = await decryptField(
    { v: 1, iv: String(envelope.iv ?? ''), ct: String(envelope.ct ?? '') },
    key,
  );
  return JSON.parse(raw);
}
