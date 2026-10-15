// What the three recovery endpoints depend on beyond the database: the pepper's keys, the scrypt function and the Auth
// calls. The defaults read the environment through the two modules that alone may (pepper.ts, auth-admin.ts); a test
// passes its own through `buildApp({ recovery })` to count scrypt computations or to stand in for Auth.

import { isAdminConfigured, resetPassword, type ResetPasswordInput, type ResetPasswordOutcome } from './auth-admin.js';
import { nodeScrypt, type ScryptFn } from './hashing.js';
import { readRecoveryKeys, type RecoveryKeys } from './pepper.js';

export interface AuthAdminPort {
  /** Whether a reset can reach Auth at all (the key and the issuer URL are usable). */
  isConfigured(): boolean;
  resetPassword(input: ResetPasswordInput): Promise<ResetPasswordOutcome>;
}

export interface RecoveryDependencies {
  /** The pepper's sub-keys, or undefined when the pepper is missing or unusable: the recovery endpoints answer 503. */
  readonly keys: () => RecoveryKeys | undefined;
  readonly scrypt: ScryptFn;
  readonly authAdmin: AuthAdminPort;
}

export function createRecoveryDependencies(overrides: Partial<RecoveryDependencies> = {}): RecoveryDependencies {
  return {
    keys: () => readRecoveryKeys(),
    scrypt: nodeScrypt,
    authAdmin: { isConfigured: () => isAdminConfigured(), resetPassword: (input) => resetPassword(input) },
    ...overrides,
  };
}
