// Keyed hashes and answer hashes of password recovery (F1.6; schema.md "recovery_answers"). Pure functions over the
// pepper's sub-keys: nothing here reads the environment or logs. An answer is first passed through HMAC-SHA256 with
// K_answer together with its question id (a correct answer typed into the wrong question fails), then through scrypt
// with the parameters stored next to the hash. Hashes are compared with timingSafeEqual.

import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { normalizeRecoveryEmail, RECOVERY_SCRYPT, type RecoveryQuestionId } from '@nestly/shared';
import type { RecoveryKeys } from './pepper.js';

export const HASH_BYTES = 32;
export const SALT_BYTES = 16;

export interface ScryptParams {
  readonly logN: number;
  readonly r: number;
  readonly p: number;
}

/** scrypt of `secret` with `salt`: 32 bytes. A test passes a spy to count the computations. */
export type ScryptFn = (secret: Buffer, salt: Buffer, params: ScryptParams) => Promise<Buffer>;

/** The real scrypt. Node's default memory limit (32 MiB) is exactly N=2^15, r=8, so `maxmem` is raised above it. */
export const nodeScrypt: ScryptFn = (secret, salt, params) => {
  const cost = 2 ** params.logN;
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, HASH_BYTES, { N: cost, r: params.r, p: params.p, maxmem: 256 * cost * params.r }, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
};

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = RECOVERY_SCRYPT;

function keyedHash(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/** HMAC-SHA256(K_handle, lower(trim(email))): the lookup key of an account; never the email. */
export function emailHandle(keys: RecoveryKeys, email: string): Buffer {
  return keyedHash(keys.handle, normalizeRecoveryEmail(email));
}

/** HMAC-SHA256(K_ip, address key) where the key is the IPv4 address or the IPv6 /64 prefix (client-ip.ts). */
export function ipHash(keys: RecoveryKeys, addressKey: string): Buffer {
  return keyedHash(keys.ip, addressKey);
}

/** The scrypt input of one answer: HMAC-SHA256(K_answer, question id || 0x00 || normalised answer). */
export function answerSecret(keys: RecoveryKeys, question: RecoveryQuestionId, normalised: string): Buffer {
  return createHmac('sha256', keys.answer).update(question, 'utf8').update(Buffer.of(0)).update(normalised, 'utf8').digest();
}

export function hashAnswer(
  scryptFn: ScryptFn,
  keys: RecoveryKeys,
  question: RecoveryQuestionId,
  normalised: string,
  salt: Buffer,
  params: ScryptParams,
): Promise<Buffer> {
  return scryptFn(answerSecret(keys, question, normalised), salt, params);
}

/** Two different random salts (the table refuses equal ones). */
export function newSaltPair(): [Buffer, Buffer] {
  const first = randomBytes(SALT_BYTES);
  let second = randomBytes(SALT_BYTES);
  while (second.equals(first)) second = randomBytes(SALT_BYTES);
  return [first, second];
}

/** Constant-time equality of two hashes. Different lengths are simply unequal (never the case for stored hashes). */
export function sameHash(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}
