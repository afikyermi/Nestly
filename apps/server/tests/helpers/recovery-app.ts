import { randomBytes } from 'node:crypto';
import type { Writable } from 'node:stream';
import { vi } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { nodeScrypt, type ScryptFn } from '../../src/recovery/hashing.js';
import type { RecoveryDependencies } from '../../src/recovery/dependencies.js';
import { setEnv, type App, type EnvValues } from './identity-fixtures.js';

// Shared by the F1.6 route and database tests. Written from interface.md "Test seams": buildApp({ database, logStream,
// recovery }), the pepper in env RECOVERY_PEPPER, the Auth stand-in at recovery.authAdmin, the scrypt spy at recovery.scrypt.
//
//   buildRecoveryApp(env, seams)      sets the environment, loads the server fresh and builds it with the recovery seam
//   setPepper(value) / restorePepper  RECOVERY_PEPPER for the next buildRecoveryApp (a missing or short pepper is a 503)
//   fakeAdmin(outcome, configured)    an Auth stand-in that records its inputs and answers one of the three outcomes
//   spyScrypt()                       the real scrypt behind a counter (a verified or failed attempt must call it exactly twice)

export type AdminOutcome = 'completed' | 'admin_failed' | 'revoke_failed';

export interface FakeAdmin {
  authAdmin: RecoveryDependencies['authAdmin'];
  calls: unknown[];
  /** change what the next calls answer, e.g. to let a retry succeed */
  answer: (outcome: AdminOutcome) => void;
}

export function fakeAdmin(outcome: AdminOutcome = 'completed', configured = true): FakeAdmin {
  const calls: unknown[] = [];
  let current = outcome;
  return {
    calls,
    answer: (next) => {
      current = next;
    },
    authAdmin: {
      isConfigured: () => configured,
      resetPassword: async (input) => {
        calls.push(input);
        return current;
      },
    },
  };
}

export interface ScryptSpy {
  scrypt: ScryptFn;
  calls: () => number;
  reset: () => void;
}

export function spyScrypt(): ScryptSpy {
  let count = 0;
  return {
    scrypt: async (secret, salt, params) => {
      count += 1;
      return nodeScrypt(secret, salt, params);
    },
    calls: () => count,
    reset: () => {
      count = 0;
    },
  };
}

export const freshPepper = (bytes = 32): string => randomBytes(bytes).toString('base64');

let savedPepper: { value: string | undefined } | undefined;
export function setPepper(value: string | undefined): void {
  savedPepper ??= { value: process.env.RECOVERY_PEPPER };
  if (value === undefined) delete process.env.RECOVERY_PEPPER;
  else process.env.RECOVERY_PEPPER = value;
}
export function restorePepper(): void {
  if (!savedPepper) return;
  if (savedPepper.value === undefined) delete process.env.RECOVERY_PEPPER;
  else process.env.RECOVERY_PEPPER = savedPepper.value;
  savedPepper = undefined;
}

export interface RecoverySeams {
  database?: Database;
  logStream?: Writable;
  recovery?: Partial<RecoveryDependencies>;
}

export async function buildRecoveryApp(env: EnvValues, seams: RecoverySeams = {}): Promise<App> {
  setEnv(env);
  vi.resetModules();
  const { buildApp } = await import('../../src/app.js');
  return buildApp({
    ...(seams.database ? { database: seams.database } : {}),
    ...(seams.logStream ? { logStream: seams.logStream } : {}),
    ...(seams.recovery ? { recovery: seams.recovery } : {}),
  });
}

export const PAIR = [
  { question: 'pet', answer: 'Rex' },
  { question: 'street', answer: 'Herzl' },
];

export function resetBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { email: 'dana.recovery@example.invalid', answers: PAIR, password: 'סיסמה חדשה 12345', ...over };
}

export function postJson(app: App, url: string, payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...headers },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}
