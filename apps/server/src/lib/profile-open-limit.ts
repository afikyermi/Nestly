// The profile-open limit as the server sees it (I2 F2.4c1; NFR-SEC-006, ERR-032). The count, the stored threshold and the Security event
// are the database's (profile_view); the server only names a refused open. Shared by the viewer read and a Friend Request's send (c24).

import { readDatabaseFault } from './pg-error.js';

/** The open was refused by the profile-open limit. `misconfigured`: the stored limit is missing or invalid (a server fault to log, c22). */
export interface RateLimited {
  readonly kind: 'rate_limited';
  readonly misconfigured: boolean;
}

/** SQLSTATE profile_view raises when the stored profile_open limit is absent or out of range (migration 20261017170000). */
const LIMIT_MISCONFIGURED_SQLSTATE = 'NS001';

/** The outcome a database refusal of the limit means, or undefined for any other failure. */
export function rateLimitFault(error: unknown): RateLimited | undefined {
  return readDatabaseFault(error)?.code === LIMIT_MISCONFIGURED_SQLSTATE ? { kind: 'rate_limited', misconfigured: true } : undefined;
}

/** A refused open that was counted and recorded normally. */
export const OPEN_LIMITED: RateLimited = { kind: 'rate_limited', misconfigured: false };
