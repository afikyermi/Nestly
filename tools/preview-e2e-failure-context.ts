// Preview E2E failure context (24.10.2026): pure redaction of one Playwright error-context.md before it is uploaded. No I/O.
// Two passes: every value of a form field in the accessibility snapshot, then every occurrence anywhere of a generated
// secret (the temporary staff users' passwords and recovery answers), so a value quoted in an error message or a heading
// cannot leave the runner either.

const FIELD_VALUE = /^(\s*- (?:textbox|searchbox|combobox|spinbutton)[^:\n]*):.*$/gm;

export const FIELD_REDACTED = '[value redacted]';
export const SECRET_REDACTED = '[secret redacted]';

/** The staff file's secret values (passwords and recovery answers), longest first; anything malformed yields none. */
export function staffSecrets(json: string | null): string[] {
  if (json === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const values: string[] = [];
  const users: unknown[] = Object.values(parsed);
  for (const user of users) {
    if (typeof user !== 'object' || user === null) continue;
    const password: unknown = 'password' in user ? user.password : undefined;
    const answers: unknown = 'answers' in user ? user.answers : undefined;
    if (typeof password === 'string') values.push(password);
    if (typeof answers === 'object' && answers !== null) {
      const given: unknown[] = Object.values(answers);
      values.push(...given.filter((v): v is string => typeof v === 'string'));
    }
  }
  return [...new Set(values.filter((v) => v.length > 0))].sort((a, b) => b.length - a.length);
}

export function redactFailureContext(text: string, secrets: readonly string[]): string {
  let out = text.replace(FIELD_VALUE, `$1: ${FIELD_REDACTED}`);
  for (const secret of secrets) {
    // The value as written and as it appears inside a JSON or quoted string.
    for (const form of new Set([secret, JSON.stringify(secret).slice(1, -1)])) out = out.split(form).join(SECRET_REDACTED);
  }
  return out;
}
