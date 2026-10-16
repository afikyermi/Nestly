// What the recovery and password endpoints depend on beyond the database: the pepper's keys, the scrypt function and the Auth
// calls. The defaults read the environment through the two modules that alone may (pepper.ts, auth-admin.ts); a test passes
// its own through `buildApp({ recovery })` to count scrypt computations or to stand in for Auth.

import {
  cancelPassword,
  isAdminConfigured,
  readSignInIdentities,
  resetPassword,
  setUserPassword,
  signOutOtherSessions,
  type IdentitiesRead,
  type PasswordSetOutcome,
  type ResetPasswordInput,
  type ResetPasswordOutcome,
  type SignOutOutcome,
} from './auth-admin.js';
import { nodeScrypt, type ScryptFn } from './hashing.js';
import { readRecoveryKeys, type RecoveryKeys } from './pepper.js';

export interface AuthAdminPort {
  /** Whether a reset can reach Auth at all (the key and the issuer URL are usable). */
  isConfigured(): boolean;
  resetPassword(input: ResetPasswordInput): Promise<ResetPasswordOutcome>;
}

/**
 * The F2.0 Auth calls (AR-1; auth-admin.ts): the S-01 detection read and clear, and the server password set of the forced
 * step (c7), the change (c10) and the F1.8 first password (c11). `userId` is always the JWT subject; `accessToken` the
 * request's own bearer token.
 */
export interface AuthAccountPort {
  /** Whether Auth can be reached with the project key at all. */
  isConfigured(): boolean;
  readIdentities(input: { readonly accessToken: string; readonly clientIp: string | undefined }): Promise<IdentitiesRead>;
  cancelPassword(input: { readonly userId: string }): Promise<PasswordSetOutcome>;
  setPassword(input: { readonly userId: string; readonly password: string }): Promise<PasswordSetOutcome>;
  signOutOthers(input: { readonly accessToken: string; readonly clientIp: string | undefined }): Promise<SignOutOutcome>;
}

export interface RecoveryDependencies {
  /** The pepper's sub-keys, or undefined when the pepper is missing or unusable: the recovery endpoints answer 503. */
  readonly keys: () => RecoveryKeys | undefined;
  readonly scrypt: ScryptFn;
  readonly authAdmin: AuthAdminPort;
  readonly authAccount: AuthAccountPort;
}

export function createRecoveryDependencies(overrides: Partial<RecoveryDependencies> = {}): RecoveryDependencies {
  return {
    keys: () => readRecoveryKeys(),
    scrypt: nodeScrypt,
    authAdmin: { isConfigured: () => isAdminConfigured(), resetPassword: (input) => resetPassword(input) },
    authAccount: {
      isConfigured: () => isAdminConfigured(),
      readIdentities: (input) => readSignInIdentities(input),
      cancelPassword: (input) => cancelPassword(input),
      setPassword: (input) => setUserPassword(input),
      signOutOthers: (input) => signOutOtherSessions(input),
    },
    ...overrides,
  };
}
