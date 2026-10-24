// Generated credentials in a runner-private file, never a repository/environment secret in a flow.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { TEST_EMAIL_REGEX, type TestUser } from './test-user.ts';
import { runEmailPrefix } from '../../tools/preview-e2e-cleanup.ts';

const user = z.object({ email: z.string().regex(TEST_EMAIL_REGEX), password: z.string().min(16),
  answers: z.object({ pet: z.string().min(2), nickname: z.string().min(2) }) });

export function readStaffUser(file: string, project: string, runId: string, attempt: string): TestUser {
  const users = z.record(z.string(), user).parse(JSON.parse(readFileSync(file, 'utf8')));
  const actor = users[project];
  const prefix = runEmailPrefix(runId, attempt).slice(0, -1);
  if (actor === undefined || !actor.email.startsWith(prefix)) throw new Error('staff actor is not from this run/project');
  return actor;
}
