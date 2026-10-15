// The recovery pepper (F1.6; schema.md "The pepper"). The ONLY file that reads RECOVERY_PEPPER: a CI check
// (tests/credentials.static.test.ts) fails when the name appears anywhere else under apps/. One secret serves three
// purposes through HKDF-SHA256, each sub-key with its own `info`, so a value derived for one purpose can never stand for
// another: the email handle, the IP hash and the answer hash.
//
// A pepper missing, malformed or shorter than 32 bytes counts as missing: the three recovery endpoints answer 503, and
// nothing else in the server depends on it.

import { hkdfSync } from 'node:crypto';

const PEPPER_ENV = 'RECOVERY_PEPPER';
const MIN_PEPPER_BYTES = 32;
const KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

export interface RecoveryKeys {
  /** K_handle: HMAC key of the email handle. */
  readonly handle: Buffer;
  /** K_ip: HMAC key of the IP hash. */
  readonly ip: Buffer;
  /** K_answer: HMAC key applied to an answer before scrypt. */
  readonly answer: Buffer;
}

type Env = Readonly<Record<string, string | undefined>>;

function derive(pepper: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', pepper, Buffer.alloc(0), `nestly/recovery/${purpose}/v1`, KEY_BYTES));
}

/** The three sub-keys, or undefined when the pepper is missing or unusable. Cheap: derived on each call, never cached. */
export function readRecoveryKeys(env: Env = process.env): RecoveryKeys | undefined {
  const raw = env[PEPPER_ENV]?.trim();
  if (raw === undefined || raw === '' || !BASE64.test(raw)) return undefined;
  const pepper = Buffer.from(raw, 'base64');
  if (pepper.length < MIN_PEPPER_BYTES) return undefined;
  return { handle: derive(pepper, 'handle'), ip: derive(pepper, 'ip'), answer: derive(pepper, 'answer') };
}
