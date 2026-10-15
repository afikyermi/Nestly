// The generated test user of one Playwright project (one viewport). Pattern per .work/preview-e2e/schema.md:
// nestly-e2e-<run_id>-<run_attempt>-<16 lowercase hex>@gmail.com, matched anchored. Gmail usernames cannot contain "-",
// so no real mailbox can match. Creation, and any later cleanup or sweep, must use this one constant and regex.
// Values are random per call; the password and the answers are never logged.

import { randomBytes } from 'node:crypto';

export const TEST_EMAIL_PATTERN = '^nestly-e2e-[0-9]{1,20}-[0-9]{1,3}-[0-9a-f]{16}@gmail\\.com$';
export const TEST_EMAIL_REGEX = new RegExp(TEST_EMAIL_PATTERN);

/** The two recovery questions every generated user chooses (F1.6 offers pet | nickname | street). */
export const RECOVERY_QUESTION_IDS = ['pet', 'nickname'] as const;
export type RecoveryQuestionId = (typeof RECOVERY_QUESTION_IDS)[number];

export interface TestUser {
  email: string;
  /** At least 16 characters, random. */
  password: string;
  /** Random answers (12 lowercase hex characters: within the 2-60 rule after normalising), one per chosen question. */
  answers: Record<RecoveryQuestionId, string>;
}

export function generateTestUser(runId: string, runAttempt: string): TestUser {
  if (!/^[0-9]{1,20}$/.test(runId) || !/^[0-9]{1,3}$/.test(runAttempt)) {
    throw new Error('test-user: GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be numeric (this runs on the preview-e2e workflow)');
  }
  const email = `nestly-e2e-${runId}-${runAttempt}-${randomBytes(8).toString('hex')}@gmail.com`;
  return {
    email,
    password: randomBytes(18).toString('base64url'),
    answers: { pet: randomBytes(6).toString('hex'), nickname: randomBytes(6).toString('hex') },
  };
}
