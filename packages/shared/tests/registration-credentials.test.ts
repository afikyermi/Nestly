import { describe, expect, it } from 'vitest';
import {
  CONSENT_PRIVACY_VERSION,
  CONSENT_TERMS_VERSION,
  CREDENTIALS_ERROR_CODES,
  EMAIL_MAX_LENGTH,
  EMAIL_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RAW_EMAIL_MAX_UNITS,
  RAW_NAME_MAX_UNITS,
  RAW_PASSWORD_MAX_UNITS,
  RAW_TOKEN_MAX_UNITS,
  REGISTRATION_ERROR_CODES,
  createRegistrationStep1Schema,
  registrationConsentInput,
  registrationCredentialsInput,
} from '../src/index.js';

// I1 F1.4 part b, first slice. Derived from spec.md criteria 1, 2, 3 (schema level) and 9 only.
//   1  credentials [VAL-002 · VAL-003 · AC-003]     2  request contract (.strict(), raw bounds, consent literal)
//   3  step 1 re-checked with the server's clock    9  consent version constants
// Issue messages are the stable codes (never prose): CREDENTIALS_ERROR_CODES / REGISTRATION_ERROR_CODES.

const TODAY = '2026-06-15';
const empty = { day: '', month: '', year: '' };
const parts = (iso: string) => {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
};
const kid = (over: Record<string, unknown> = {}) => ({ name: 'נועה', sex: 'girl', birthDate: parts('2024-02-29'), ...over });
const body = (over: Record<string, unknown> = {}) => ({
  stages: ['planning'],
  fullName: 'דנה כהן',
  parentGender: undefined,
  dueDate: empty,
  children: [],
  ...over,
});
const step1 = createRegistrationStep1Schema(TODAY);

function messages(r: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return r.success ? [] : (r.error?.issues ?? []).map((i) => i.message);
}
function issueCodes(r: { success: boolean; error?: { issues: { code?: string }[] } }): string[] {
  return r.success ? [] : (r.error?.issues ?? []).map((i) => String(i.code));
}
const stepCodes = (input: unknown): string[] => {
  const r = step1.safeParse(input);
  if (r.success) return [];
  const blob = JSON.stringify(r.error.issues);
  return REGISTRATION_ERROR_CODES.filter((c) => blob.includes(`"${c}"`));
};
const creds = (email: string, password: string) => registrationCredentialsInput.safeParse({ email, password });
const GOOD_PW = 'abcdefgh';

describe('F1.4 criterion 1 [VAL-002 · AC-003] email', () => {
  const table: [string, string, boolean][] = [
    ['a@b.co (the smallest valid shape)', 'a@b.co', true],
    ['padded with spaces is trimmed, then valid', '  a@b.co  ', true],
    ['padded with a tab and newline', '\t a@b.co \n', true],
    ['empty', '', false],
    ['spaces only', '     ', false],
    ['a@b (no dot in the domain)', 'a@b', false],
    ['a b@c.com (space inside)', 'a b@c.com', false],
    ['a@b c.com (space in the domain)', 'a@b c.com', false],
    ['no @', 'ab.co', false],
    ['two @', 'a@@b.co', false],
    ['two @ apart', 'a@b@c.co', false],
    ['empty local part', '@b.co', false],
    ['domain starting with a dot', 'a@.co', false],
    ['domain ending with a dot', 'a@b.', false],
    ['only an @', '@', false],
    ['254 characters', `${'x'.repeat(254 - '@b.co'.length)}@b.co`, true],
    ['255 characters', `${'x'.repeat(255 - '@b.co'.length)}@b.co`, false],
    ['hostile text without spaces is data', "x');--@b.co", true],
  ];
  it.each(table)('[VAL-002 · AC-003] %s', (_label, email, accepted) => {
    expect(creds(email, GOOD_PW).success).toBe(accepted);
  });

  it('[VAL-002] the output email is trimmed; the password is untouched', () => {
    const r = creds('  a@b.co  ', ' pass word ');
    expect(r.success && r.data.email).toBe('a@b.co');
    expect(r.success && r.data.password).toBe(' pass word ');
  });
  it('[VAL-002] empty after trim is email_required; the other failures are email_invalid', () => {
    expect(messages(creds('', GOOD_PW))).toContain('email_required');
    expect(messages(creds('   ', GOOD_PW))).toContain('email_required');
    expect(messages(creds('a@b', GOOD_PW))).toContain('email_invalid');
    expect(messages(creds('a b@c.com', GOOD_PW))).toContain('email_invalid');
    for (const m of [...messages(creds('', GOOD_PW)), ...messages(creds('a@b', GOOD_PW))]) {
      expect(
        CREDENTIALS_ERROR_CODES.some((code) => code === m),
        `${m} is not a CREDENTIALS_ERROR_CODES value`,
      ).toBe(true);
    }
  });
  it('[VAL-002] the bound is on the RAW string: padding that would trim to a valid email is still too long (> 512 units)', () => {
    expect(creds(`${' '.repeat(RAW_EMAIL_MAX_UNITS)}a@b.co`, GOOD_PW).success).toBe(false);
    expect(creds(`a@b.co${' '.repeat(600)}`, GOOD_PW).success).toBe(false);
  });
  it('[VAL-002] non-string email is refused', () => {
    for (const bad of [null, undefined, 42, {}, ['a@b.co'], true]) {
      expect(registrationCredentialsInput.safeParse({ email: bad, password: GOOD_PW }).success).toBe(false);
    }
  });
});

describe('F1.4 criterion 1 [VAL-003 · AC-003] password (minimum 8, Afik 14.10)', () => {
  const cp = (n: number, ch = 'x') => ch.repeat(n);
  const table: [string, string, boolean][] = [
    ['7 characters', cp(7), false],
    ['8 characters', cp(8), true],
    ['9 characters', cp(9), true],
    ['8 Hebrew letters', 'אבגדהוזח', true],
    ['7 Hebrew letters', 'אבגדהוז', false],
    ['eight spaces (no composition rule, not trimmed)', ' '.repeat(8), true],
    ['seven spaces', ' '.repeat(7), false],
    ['7 characters padded by spaces to 9 (spaces count)', ' abcdefg ', true],
    ['8 emoji (8 code points, 16 UTF-16 units)', '😀'.repeat(8), true],
    ['4 emoji (4 code points, 8 units: units are not the measure)', '😀'.repeat(4), false],
    ['256 code points', cp(256), true],
    ['257 code points', cp(257), false],
    ['256 emoji (512 units, 256 code points)', '😀'.repeat(256), true],
    ['257 emoji', '😀'.repeat(257), false],
    ['empty', '', false],
    ['1024 units of ASCII (past 256 code points)', cp(1024), false],
    ['1025 units (past the raw bound)', cp(1025), false],
    ['digits only, no letters (no composition rule)', '12345678', true],
    ['a common password is not refused (VAL-003 forbids a breach check)', 'password', true],
    ['hostile text is data', "'; drop table users;--", true],
  ];
  it.each(table)('[VAL-003 · AC-003] %s', (_label, password, accepted) => {
    expect(creds('a@b.co', password).success).toBe(accepted);
  });
  it('[VAL-003] a failure is password_length', () => {
    expect(messages(creds('a@b.co', 'short'))).toContain('password_length');
    expect(messages(creds('a@b.co', ''))).toContain('password_length');
    expect(messages(creds('a@b.co', cp(257)))).toContain('password_length');
  });
  it('[VAL-003] the password is returned exactly as sent: spaces kept, no normalisation', () => {
    const r = creds('a@b.co', '  spaced out  ');
    expect(r.success && r.data.password).toBe('  spaced out  ');
  });
  it('[VAL-003] non-string password is refused', () => {
    for (const bad of [null, undefined, 12345678, {}, ['abcdefgh']]) {
      expect(registrationCredentialsInput.safeParse({ email: 'a@b.co', password: bad }).success).toBe(false);
    }
  });
});

describe('F1.4 criterion 2 [F1.3 debt] the credentials object is strict', () => {
  it('rejects an unknown key, a missing key, and a non-object', () => {
    expect(registrationCredentialsInput.safeParse({ email: 'a@b.co', password: GOOD_PW, extra: 1 }).success).toBe(false);
    expect(issueCodes(registrationCredentialsInput.safeParse({ email: 'a@b.co', password: GOOD_PW, role: 'admin' }))).toContain(
      'unrecognized_keys',
    );
    expect(registrationCredentialsInput.safeParse({ email: 'a@b.co' }).success).toBe(false);
    expect(registrationCredentialsInput.safeParse({ password: GOOD_PW }).success).toBe(false);
    for (const bad of [null, undefined, 'a@b.co', [], 42]) {
      expect(registrationCredentialsInput.safeParse(bad).success).toBe(false);
    }
  });
  // No wall-clock limit (a loaded machine made one flaky). "By length, not by scanning" is shown by the verdict: an input that
  // a scan would judge differently is refused with the length verdict only.
  it('a 5 MB email or password is refused by length, not by scanning', () => {
    // A scan (trim, then look for the shape) would call 5 MB of spaces "email_required"; the length check says "email_invalid" only.
    const spaces = creds(' '.repeat(5_000_000), GOOD_PW);
    expect(spaces.success).toBe(false);
    expect(messages(spaces)).toEqual(['email_invalid']);
    expect(issueCodes(spaces)).toEqual(['too_big']);
    // The same for a 5 MB run of letters (a scan would say "email_invalid" for no "@": the code tells them apart).
    const letters = creds('x'.repeat(5_000_000), GOOD_PW);
    expect(letters.success).toBe(false);
    expect(issueCodes(letters)).toEqual(['too_big']);
    // A password of 5 MB: the verdict is the length one alone, carried by the raw-bound issue; the code-point check must not
    // run once the raw bound has failed (no second, custom issue), and no email issue is added (F1.4, debt.md A6).
    const long = creds('a@b.co', 'x'.repeat(5_000_000));
    expect(long.success).toBe(false);
    expect(issueCodes(long)).toEqual(['too_big']);
    expect(messages(long)).toEqual(['password_length']);
  });
  it('a password of exactly RAW_PASSWORD_MAX_UNITS units still gets the code-point length verdict', () => {
    // At the raw bound the raw check passes, so the code-point check must still run: 1024 code points > PASSWORD_MAX_LENGTH.
    const atBound = creds('a@b.co', 'x'.repeat(RAW_PASSWORD_MAX_UNITS));
    expect(atBound.success).toBe(false);
    expect(messages(atBound)).toEqual(['password_length']);
    expect(issueCodes(atBound)).toEqual(['custom']);
  });
});

describe('F1.4 criterion 2 [F1.3 debt] the step-1 contract is strict at every level', () => {
  it('baseline: a valid body passes', () => {
    expect(step1.safeParse(body()).success).toBe(true);
    expect(step1.safeParse(body({ stages: ['has_child'], children: [kid()] })).success).toBe(true);
  });

  it('an unknown key at the top level is rejected with unrecognized_keys', () => {
    for (const key of ['extra', 'isAdmin', '__proto__x', 'parentBirthDate', 'consentTermsVersion', 'termsVersion', 'consent', 'email', 'password']) {
      const r = step1.safeParse({ ...body(), [key]: 'x' });
      expect(r.success, key).toBe(false);
      expect(issueCodes(r), key).toContain('unrecognized_keys');
    }
  });
  it('an unknown key inside dueDate is rejected', () => {
    const r = step1.safeParse(body({ stages: ['pregnant'], dueDate: { ...parts('2026-12-01'), hour: '3' } }));
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toContain('unrecognized_keys');
  });
  it('an unknown key inside a child is rejected, in any position', () => {
    for (const idx of [0, 1, 2]) {
      const children = [kid(), kid(), kid()].map((c, i) => (i === idx ? { ...c, nickname: 'x' } : c));
      const r = step1.safeParse(body({ stages: ['has_child'], children }));
      expect(r.success, `child ${idx}`).toBe(false);
      expect(issueCodes(r), `child ${idx}`).toContain('unrecognized_keys');
    }
  });
  it("an unknown key inside a child's birthDate is rejected", () => {
    const r = step1.safeParse(body({ stages: ['has_child'], children: [kid({ birthDate: { ...parts('2024-02-29'), era: 'x' } })] }));
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toContain('unrecognized_keys');
  });
  it('unknown keys are rejected even when has_child / pregnant are not ticked (the section would be dropped otherwise)', () => {
    expect(step1.safeParse(body({ stages: ['planning'], children: [kid({ nickname: 'x' })] })).success).toBe(false);
    expect(step1.safeParse(body({ stages: ['planning'], dueDate: { ...parts('2026-12-01'), hour: '3' } })).success).toBe(false);
  });
  it('a body that is not an object is rejected', () => {
    for (const bad of [null, undefined, 'x', 42, [], [body()]]) expect(step1.safeParse(bad).success).toBe(false);
  });
});

describe('F1.4 criterion 2 [F1.3 debt] raw bounds run before code-point splitting', () => {
  it('11 raw children are rejected with children_too_many, at any stage (the F1.3 test sent 13 with only planning)', () => {
    expect(stepCodes(body({ stages: ['planning'], children: Array.from({ length: 11 }, () => kid()) }))).toContain('children_too_many');
    expect(stepCodes(body({ stages: ['pregnant'], children: Array.from({ length: 11 }, () => kid()) }))).toContain('children_too_many');
    expect(stepCodes(body({ stages: ['has_child'], children: Array.from({ length: 11 }, () => kid()) }))).toContain('children_too_many');
    expect(stepCodes(body({ stages: ['planning'], children: Array.from({ length: 1000 }, () => kid()) }))).toContain('children_too_many');
  });
  it('10 raw children are accepted at any stage', () => {
    expect(step1.safeParse(body({ stages: ['planning'], children: Array.from({ length: 10 }, () => kid()) })).success).toBe(true);
    expect(step1.safeParse(body({ stages: ['has_child'], children: Array.from({ length: 10 }, () => kid()) })).success).toBe(true);
  });
  it('a bound failure reports only the bound: the transform does not run on the rest', () => {
    const children = Array.from({ length: 11 }, () => kid({ sex: 'bogus', name: '' }));
    expect(stepCodes(body({ stages: ['has_child'], children }))).toEqual(['children_too_many']);
  });
  it('stages: more than 3 items, or an item over 32 units, is stage_invalid', () => {
    expect(stepCodes(body({ stages: ['planning', 'planning', 'planning', 'planning'] }))).toContain('stage_invalid');
    expect(stepCodes(body({ stages: ['pregnant', 'has_child', 'planning', 'x'] }))).toContain('stage_invalid');
    expect(stepCodes(body({ stages: ['x'.repeat(33)] }))).toContain('stage_invalid');
    expect(stepCodes(body({ stages: ['x'.repeat(5_000_000)] }))).toContain('stage_invalid');
  });
  it('names, gender, sex and date parts over their raw bound are rejected with their own codes', () => {
    expect(stepCodes(body({ fullName: 'x'.repeat(RAW_NAME_MAX_UNITS + 1) }))).toContain('full_name_length');
    expect(stepCodes(body({ stages: ['has_child'], children: [kid({ name: 'x'.repeat(RAW_NAME_MAX_UNITS + 1) })] }))).toContain('child_name_length');
    expect(stepCodes(body({ parentGender: 'x'.repeat(33) }))).toContain('parent_gender_invalid');
    expect(stepCodes(body({ stages: ['has_child'], children: [kid({ sex: 'x'.repeat(33) })] }))).toContain('child_sex_invalid');
    expect(stepCodes(body({ stages: ['pregnant'], dueDate: { day: '1'.repeat(33), month: '1', year: '2026' } }))).toContain('due_date_invalid');
    expect(stepCodes(body({ stages: ['has_child'], children: [kid({ birthDate: { day: '1', month: '1'.repeat(33), year: '2024' } })] }))).toContain(
      'birth_date_invalid',
    );
  });
  // No wall-clock limit (step 11, 18.10.2026): the raw bound stops the pipe, so the only issue is its too_big; code-point
  // splitting of 5 million characters would add the name rule's own (custom) issue.
  it('a 5 MB name is rejected by the raw bound alone (no code-point splitting of 5 million characters)', () => {
    const r = step1.safeParse(body({ fullName: 'x'.repeat(5_000_000) }));
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toEqual(['too_big']);
    expect(messages(r)).toEqual(['full_name_length']);
  });
  it('a 5 MB emoji name (2 units per code point) and a 5 MB child name are also rejected by the raw bound alone', () => {
    for (const input of [
      body({ fullName: '😀'.repeat(2_500_000) }),
      body({ stages: ['has_child'], children: [kid({ name: 'x'.repeat(5_000_000) })] }),
    ]) {
      const r = step1.safeParse(input);
      expect(r.success).toBe(false);
      expect(issueCodes(r)).toEqual(['too_big']);
    }
  });
  it('the bound is on UTF-16 units: 600 units pass the bound (and fail the 60-code-point rule), 601 fail the bound', () => {
    expect(stepCodes(body({ fullName: 'x'.repeat(RAW_NAME_MAX_UNITS) }))).toContain('full_name_length');
    expect(stepCodes(body({ fullName: 'x'.repeat(RAW_NAME_MAX_UNITS + 1) }))).toContain('full_name_length');
    expect(step1.safeParse(body({ fullName: 'x'.repeat(60) })).success).toBe(true);
  });
  it('the constants carry the values the spec states', () => {
    expect(RAW_NAME_MAX_UNITS).toBe(600);
    expect(RAW_EMAIL_MAX_UNITS).toBe(512);
    expect(RAW_PASSWORD_MAX_UNITS).toBe(1024);
    expect(RAW_TOKEN_MAX_UNITS).toBe(32);
    expect(EMAIL_MIN_LENGTH).toBe(3);
    expect(EMAIL_MAX_LENGTH).toBe(254);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(256);
  });
});

describe('F1.4 criterion 2 [FR-REG-004 · AC-084] consent must be the literal true', () => {
  it('true passes', () => {
    expect(registrationConsentInput.safeParse(true).success).toBe(true);
  });
  it.each([
    ['false', false],
    ['the string "true"', 'true'],
    ['the string "True"', 'True'],
    ['undefined (absent)', undefined],
    ['null', null],
    ['1', 1],
    ['0', 0],
    ['"yes"', 'yes'],
    ['an object', { accepted: true }],
    ['an array [true]', [true]],
    ['an empty string', ''],
  ])('%s is rejected with consent_required', (_label, value) => {
    const r = registrationConsentInput.safeParse(value);
    expect(r.success).toBe(false);
    expect(messages(r)).toContain('consent_required');
  });
});

describe('F1.4 criterion 3 [FR-REG-004 · VAL-001/005/039/040] step 1 with the server clock (Q4: one day of tolerance)', () => {
  // The server passes its UTC date plus one day; the schema's rules do not otherwise change. Server date 2026-06-15 -> today = 2026-06-16.
  const serverDate = '2026-06-15';
  const plusOne = '2026-06-16';
  const server = createRegistrationStep1Schema(plusOne);
  const has = (iso: string) => server.safeParse(body({ stages: ['has_child'], children: [kid({ birthDate: parts(iso) })] })).success;
  it('a birth date equal to the server date passes; the day after passes (Q4); two days after fails', () => {
    expect(has(serverDate)).toBe(true);
    expect(has('2026-06-16')).toBe(true);
    expect(has('2026-06-17')).toBe(false);
    expect(has('2027-01-01')).toBe(false);
  });
  it('every other F1.3 rule still holds under the server clock', () => {
    expect(server.safeParse(body({ stages: ['planning', 'pregnant'] })).success).toBe(false);
    expect(server.safeParse(body({ stages: ['has_child'], children: [] })).success).toBe(false);
    expect(server.safeParse(body({ fullName: 'א' })).success).toBe(false);
    expect(has('1899-12-31')).toBe(false);
    expect(has('1900-01-01')).toBe(true);
  });
  it('(the route that supplies the server date does not exist yet: this asserts the schema side only)', () => {
    expect(server.safeParse(body()).success).toBe(true);
  });
});

describe('F1.4 criterion 9 [AC-084] consent version constants', () => {
  it('exist, are non-empty strings, and fit the database column (<= 64 characters)', () => {
    for (const v of [CONSENT_TERMS_VERSION, CONSENT_PRIVACY_VERSION]) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThanOrEqual(1);
      expect(v.length).toBeLessThanOrEqual(64);
      expect(v).toBe(v.trim());
    }
  });
  it('the registration schemas accept no consent version from the client (criterion 2): neither as a key nor inside a credentials object', () => {
    expect(step1.safeParse({ ...body(), termsVersion: CONSENT_TERMS_VERSION }).success).toBe(false);
    expect(step1.safeParse({ ...body(), privacyVersion: CONSENT_PRIVACY_VERSION }).success).toBe(false);
    expect(registrationCredentialsInput.safeParse({ email: 'a@b.co', password: GOOD_PW, termsVersion: 'x' }).success).toBe(false);
  });
});
