// Preview-only test harness. Afik approved temporary Moderators and scoped Audit cleanup, 23.10.2026.
// No runtime import; the workflow runs this only from its trusted main checkout.
import { generateTestUser, type TestUser } from '../e2e-preview/support/test-user.ts';
import { errorCode, runEmailPrefix } from './preview-e2e-cleanup.ts';

export const STAFF_PROJECTS = ['mobile-375', 'desktop-1280'] as const;
export type StaffUsers = Record<string, TestUser>;

export function checkStaffContext(env: NodeJS.ProcessEnv): void {
  if (env['GITHUB_ACTIONS'] !== 'true' || env['GITHUB_REPOSITORY'] !== 'afikyermi/Nestly' || env['GITHUB_REF'] !== 'refs/heads/main' ||
      !['schedule', 'workflow_dispatch'].includes(env['GITHUB_EVENT_NAME'] ?? '')) {
    throw new Error('staff setup requires the main Preview workflow');
  }
  runEmailPrefix(env['GITHUB_RUN_ID'] ?? '', env['GITHUB_RUN_ATTEMPT'] ?? '');
}

export function makeStaffUsers(runId: string, attempt: string): StaffUsers {
  return Object.fromEntries(STAFF_PROJECTS.map((project) => [project, generateTestUser(runId, attempt)]));
}

/** Register generated secrets with the Actions runner before a browser error can quote a fill value. */
export function maskStaffUsers(users: StaffUsers, write: (command: string) => void): void {
  for (const user of Object.values(users)) {
    for (const value of [user.password, user.answers.pet, user.answers.nickname]) {
      const escaped = value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      write(`::add-mask::${escaped}\n`);
    }
  }
}

/** The setup's steps, in order. A failure names the step it reached and the error's code only: never a value, URL, email or id. */
export const STAFF_STEPS = ['context', 'url guard', 'staff file path', 'preflight', 'transaction', 'auth user', 'auth identity',
  'account and keys', 'staff file'] as const;
export type StaffStep = (typeof STAFF_STEPS)[number];

export function staffFailureLine(step: StaffStep, error: unknown): string {
  return `preview staff: setup failed at step "${step}" (code ${errorCode(error)})\n`;
}
