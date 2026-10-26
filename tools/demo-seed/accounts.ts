// The demo accounts: persona key -> email and password, from the DEMO_ACCOUNTS secret (JSON). Afik writes the secret; for a Preview it
// can be generated with `node tools/demo-seed/make-accounts.ts --out <file>` and pasted. Nothing here prints an email or a password.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { TEST_EMAIL_REGEX } from '../../e2e-preview/support/test-user.ts';

/**
 * The one shape a demo account email may have (review of #279): a Gmail username cannot contain "-", so no real mailbox matches, and the
 * seed and the shift never act on an account outside it. It is not the preview-e2e shape, so the Preview cleanup never deletes one.
 */
export const DEMO_EMAIL_REGEX = /^nestly-demo-[a-z0-9]+@gmail.com$/;

export interface DemoAccount {
  email: string;
  password: string;
}

const accountSchema = z.strictObject({ email: z.email(), password: z.string().min(12).max(256) });
const accountsSchema = z.record(z.string().regex(/^[a-z0-9-]{2,40}$/), accountSchema);

export type AccountsCheck = { ok: true; accounts: Map<string, DemoAccount> } | { ok: false; reason: string };

/**
 * Parses the secret and checks it against the personas: every persona has an account, no account is unknown, no email repeats, and no
 * email has the shape of a preview-e2e test user (the Preview cleanup deletes those; a demo account must never match it). A reason
 * names keys only, never a value.
 */
export function parseAccounts(raw: string | undefined, personaKeys: readonly string[]): AccountsCheck {
  if (raw === undefined || raw.trim() === '') return { ok: false, reason: 'DEMO_ACCOUNTS is not set' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'DEMO_ACCOUNTS is not JSON' };
  }
  const parsed = accountsSchema.safeParse(json);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '(root)')))];
    return { ok: false, reason: `DEMO_ACCOUNTS has an invalid entry: ${keys.join(', ')} (an email and a password of 12+ characters each)` };
  }
  const accounts = new Map(Object.entries(parsed.data));
  const missing = personaKeys.filter((k) => !accounts.has(k));
  if (missing.length > 0) return { ok: false, reason: `DEMO_ACCOUNTS has no account for: ${missing.join(', ')}` };
  const unknown = [...accounts.keys()].filter((k) => !personaKeys.includes(k));
  if (unknown.length > 0) return { ok: false, reason: `DEMO_ACCOUNTS names unknown personas: ${unknown.join(', ')}` };
  const emails = new Map<string, string>();
  for (const [k, a] of accounts) {
    const email = a.email.toLowerCase();
    if (TEST_EMAIL_REGEX.test(email)) return { ok: false, reason: `DEMO_ACCOUNTS ${k}: the email has the preview-e2e test-user shape` };
    if (!DEMO_EMAIL_REGEX.test(email)) return { ok: false, reason: `DEMO_ACCOUNTS ${k}: the email is not of the demo shape nestly-demo-<key>@gmail.com` };
    const other = emails.get(email);
    if (other !== undefined) return { ok: false, reason: `DEMO_ACCOUNTS ${other} and ${k} share an email` };
    emails.set(email, k);
  }
  return { ok: true, accounts };
}

/** A fresh account file for a Preview: `template` holds `{key}` (e.g. nestly-demo-{key}@gmail.com). Random 24-character passwords. */
export function generateAccounts(personaKeys: readonly string[], template: string): Record<string, DemoAccount> {
  if (!template.includes('{key}')) throw new Error('the email template must contain {key}');
  const out: Record<string, DemoAccount> = {};
  for (const k of personaKeys) out[k] = { email: template.replace('{key}', k), password: randomBytes(18).toString('base64url') };
  return out;
}

/** Two random recovery answers (POST /api/recovery-questions). Never stored or printed: a demo account recovers through Afik. */
export function randomRecoveryAnswers(): { question: 'pet' | 'nickname'; answer: string }[] {
  return [
    { question: 'pet', answer: randomBytes(6).toString('hex') },
    { question: 'nickname', answer: randomBytes(6).toString('hex') },
  ];
}

/**
 * On GitHub Actions, registers every email and password as a log mask before anything runs (GitHub masks the DEMO_ACCOUNTS secret as a
 * whole, not the values inside it). The `::add-mask::` command line itself is not shown in the log.
 */
export function maskAccounts(accounts: ReadonlyMap<string, DemoAccount>, write: (line: string) => void, onActions: boolean): void {
  if (!onActions) return;
  for (const a of accounts.values()) {
    write(`::add-mask::${a.password}\n`);
    write(`::add-mask::${a.email}\n`);
  }
}
