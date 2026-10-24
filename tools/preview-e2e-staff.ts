// Preview-only test harness. Afik approved temporary Moderators and scoped Audit cleanup, 23.10.2026.
// No runtime import; the workflow runs this only from its trusted main checkout.
import { generateTestUser, type TestUser } from '../e2e-preview/support/test-user.ts';
import { errorCode, runEmailPrefix } from './preview-e2e-cleanup.ts';

export const STAFF_PROJECTS = ['mobile-375', 'desktop-1280'] as const;
export type StaffProject = (typeof STAFF_PROJECTS)[number];
export type StaffUsers = Record<string, TestUser>;

/**
 * The one Playwright project this runner walks (Afik 24.10, §14.2: each viewport on its own runner, at the same time). Each runner's
 * setup creates only its own viewport's Moderator, so the two runners never share an account, a recovery-question gate or a staff file.
 */
export function staffProjectOf(env: NodeJS.ProcessEnv): StaffProject {
  const project = STAFF_PROJECTS.find((name) => name === env['PREVIEW_E2E_PROJECT']);
  if (project === undefined) throw new Error('staff setup needs PREVIEW_E2E_PROJECT, one of the Playwright projects');
  return project;
}

/** The private runner-temp file of one project's staff credentials (one file per project, so no runner reads another's). */
export function staffFileName(project: StaffProject): string {
  return `preview-e2e-staff-${project}.json`;
}

export function checkStaffContext(env: NodeJS.ProcessEnv): void {
  if (env['GITHUB_ACTIONS'] !== 'true' || env['GITHUB_REPOSITORY'] !== 'afikyermi/Nestly' || env['GITHUB_REF'] !== 'refs/heads/main' ||
      !['schedule', 'workflow_dispatch'].includes(env['GITHUB_EVENT_NAME'] ?? '')) {
    throw new Error('staff setup requires the main Preview workflow');
  }
  runEmailPrefix(env['GITHUB_RUN_ID'] ?? '', env['GITHUB_RUN_ATTEMPT'] ?? '');
}

/** One project's Moderator, keyed by its project (support/staff-user.ts reads it by `info.project.name`). */
export function makeStaffUsers(runId: string, attempt: string, project: StaffProject): StaffUsers {
  return { [project]: generateTestUser(runId, attempt) };
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
