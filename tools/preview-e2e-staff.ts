// Preview-only test harness. Afik approved temporary Moderators and scoped Audit cleanup, 23.10.2026.
// No runtime import; the workflow runs this only from its trusted main checkout.
import { generateTestUser, type TestUser } from '../e2e-preview/support/test-user.ts';
import { runEmailPrefix } from './preview-e2e-cleanup.ts';

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
