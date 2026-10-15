// The harness every flow file imports:  import { test, expect } from './support/fixtures.ts';
//
//   testUser          worker-scoped: one generated user per Playwright project (viewport), same object in every test
//                     of that project. { email, password, answers: { pet, nickname } }. Never log password or answers.
//   recoveryAttempts  worker-scoped: recordFailedAttempt(testUser.email) before each deliberately wrong /recovery
//                     submission; it throws on the 5th per user.
//   baseURL           the validated Preview URL (Playwright's own option): page.goto('/recovery').
//   page / context    the deployment host gets the Vercel bypass; other hosts (supabase.co) never see it.
//
// The bypass secret is read once from the worker's environment and deleted from it, so flow code cannot read it.

import { test as base, expect } from '@playwright/test';
import { createBypassRouteHandler } from './bypass.ts';
import { createRecoveryAttempts, type RecoveryAttempts } from './recovery-attempts.ts';
import { generateTestUser, type TestUser } from './test-user.ts';

interface WorkerFixtures {
  testUser: TestUser;
  recoveryAttempts: RecoveryAttempts;
  bypassSecret: string;
}

export const test = base.extend<object, WorkerFixtures>({
  testUser: [
    async ({}, use) => {
      await use(generateTestUser(process.env['GITHUB_RUN_ID'] ?? '', process.env['GITHUB_RUN_ATTEMPT'] ?? ''));
    },
    { scope: 'worker' },
  ],
  recoveryAttempts: [
    async ({}, use) => {
      await use(createRecoveryAttempts());
    },
    { scope: 'worker' },
  ],
  bypassSecret: [
    async ({}, use) => {
      const secret = process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
      delete process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
      if (secret === undefined || secret === '') throw new Error('preview-e2e: the bypass secret is missing from the environment');
      await use(secret);
    },
    { scope: 'worker' },
  ],
  context: async ({ context, baseURL, bypassSecret }, use) => {
    if (baseURL === undefined) throw new Error('preview-e2e: no baseURL (the config sets it from the validated URL)');
    const origin = new URL(baseURL).origin;
    await context.route(`${origin}/**`, createBypassRouteHandler(origin, bypassSecret));
    await use(context);
  },
});

export { expect };
