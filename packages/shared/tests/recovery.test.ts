import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RAW_ANSWER_MAX_UNITS,
  RECOVERY_ANSWER_COUNT,
  RECOVERY_ANSWER_MAX_LENGTH,
  RECOVERY_ANSWER_MIN_LENGTH,
  RECOVERY_EVENT_KINDS,
  RECOVERY_LIMITS,
  RECOVERY_QUESTION_IDS,
  RECOVERY_SCRYPT,
  normalizeRecoveryAnswer,
  normalizeRecoveryEmail,
  recoveryChangeRequest,
  recoveryResetRequest,
  recoveryStoreRequest,
} from '../src/index.js';

// F1.6 password recovery by security questions (FR-AUTH-003, AC-092, VAL-003, NFR-SEC-001). Derived from
// .work/password-recovery/spec.md (criteria 1, 2, 4, 7, 8, 12, 14 at the schema level) and interface.md "Exports".
// The normaliser is the one place a typed answer becomes a comparable value, so criterion 7 is asserted here only.

const entry = (question: string, answer: string) => ({ question, answer });
const PAIR = [entry('pet', 'Rex'), entry('street', 'Herzl')];
const hebrewLetters = (n: number): string => 'א'.repeat(n);

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c7 FR-AUTH-003] normalizeRecoveryAnswer maps equal answers to one value and keeps different ones apart', () => {
  const same = (a: string, b: string): void => expect(normalizeRecoveryAnswer(a)).toBe(normalizeRecoveryAnswer(b));
  const different = (a: string, b: string): void => expect(normalizeRecoveryAnswer(a)).not.toBe(normalizeRecoveryAnswer(b));

  it('[F1.6 c7] spaces, a hyphen and niqqud do not matter: "  בֶּן-גוריון ", "בן גוריון" and "בןגוריון" are one value', () => {
    same('  בֶּן-גוריון ', 'בן גוריון');
    same('בן גוריון', 'בןגוריון');
    same('  בֶּן-גוריון ', 'בןגוריון');
  });

  it('[F1.6 c7] final letters equal regular letters: "ךם" is "כמ", and a word ending in a final letter equals the same word with the regular one', () => {
    same('ךם', 'כמ');
    same('שלום', 'שלומ');
    same('ןףץ', 'נפצ');
  });

  it('[F1.6 c7] Latin case does not matter: "Rex" is "rex"', () => {
    same('Rex', 'rex');
    same('REX', 'rex');
  });

  it('[F1.6 c7] Arabic-Indic digits are digits: "٣" is "3" (and Eastern Arabic-Indic "۳" too)', () => {
    same('٣', '3');
    same('۳', '3');
    same('٠١٢٣٤٥٦٧٨٩', '0123456789');
  });

  it('[F1.6 c7] a longer answer stays different from a shorter one: "ab" is not "abc"', () => {
    different('ab', 'abc');
    different('abc', 'ab');
  });

  it('[F1.6 c7] cantillation marks and niqqud are removed over the whole range U+0591-U+05C7', () => {
    same('שָׁלוֹם', 'שלום');
    same('בְּרֵאשִׁית', 'בראשית');
    same('אְׇ֑֯ב', 'אב');
  });

  it('[F1.6 c7] Unicode compatibility forms are folded (NFKC): fullwidth Latin equals ASCII', () => {
    same('ＲＥＸ', 'rex');
    same('ｒｅｘ', 'REX');
  });

  it('[F1.6 c7] quotes, geresh, gershayim, hyphens and punctuation are removed', () => {
    same("ג'ורג'", 'גורג');
    same('ג׳ורג׳', 'גורג');
    same('"דוד"', 'דוד');
    same('ד״ר', 'דר');
    same('mary-jane', 'maryjane');
    same("o'neil.", 'oneil');
  });

  it('[F1.6 c7] every kind of white space is removed (space, tab, no-break space, newline)', () => {
    same('a b\tc d\ne', 'abcde');
  });

  it('[F1.6 c7] it is idempotent: normalising twice gives the first result', () => {
    for (const raw of ['  בֶּן-גוריון ', 'Rex', '٣', 'ךם', "ג'ורג'", 'ＲＥＸ ']) {
      const once = normalizeRecoveryAnswer(raw);
      expect(normalizeRecoveryAnswer(once)).toBe(once);
    }
  });

  it('[F1.6 c7] different Hebrew words stay different, and a letter swapped for its look-alike stays different', () => {
    different('כלב', 'כלה');
    different('דוד', 'רוד');
    different('בן', 'בנ ן');
  });

  it('[F1.6 c7] an answer of only separators becomes the empty string (the length rule then refuses it)', () => {
    expect(normalizeRecoveryAnswer(' - " \' . ')).toBe('');
    expect(normalizeRecoveryAnswer('')).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c8 FR-AUTH-003] normalizeRecoveryEmail: the lookup handle is computed from one spelling of an address', () => {
  it('[F1.6 c8] case and surrounding space do not change it', () => {
    expect(normalizeRecoveryEmail(' Dana@Example.COM ')).toBe(normalizeRecoveryEmail('dana@example.com'));
    expect(normalizeRecoveryEmail('\tDANA@example.com\n')).toBe(normalizeRecoveryEmail('dana@example.com'));
  });

  it('[F1.6 c8] two different addresses stay different', () => {
    expect(normalizeRecoveryEmail('dana@example.com')).not.toBe(normalizeRecoveryEmail('dana2@example.com'));
    expect(normalizeRecoveryEmail('dana@example.com')).not.toBe(normalizeRecoveryEmail('dana@example.org'));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c1 c2] the store request: exactly two entries of two different known questions, answers of 2 to 60 characters', () => {
  const ok = (body: unknown): boolean => recoveryStoreRequest.safeParse(body).success;

  it('[F1.6 c1] two entries of two different ids pass, in any order and for each of the three pairs', () => {
    expect(ok({ answers: PAIR })).toBe(true);
    expect(ok({ answers: [PAIR[1], PAIR[0]] })).toBe(true);
    expect(ok({ answers: [entry('pet', 'Rex'), entry('nickname', 'Dudi')] })).toBe(true);
    expect(ok({ answers: [entry('nickname', 'Dudi'), entry('street', 'Herzl')] })).toBe(true);
  });

  it('[F1.6 c1 c7] the parse output carries the NORMALISED answers (the server never sees the typed form again)', () => {
    const parsed = recoveryStoreRequest.parse({ answers: [entry('pet', '  Rex '), entry('street', 'בֶּן-גוריון')] });
    expect(parsed.answers.map((a) => a.answer)).toEqual(['rex', 'בנגוריונ']);
    expect(parsed.answers.map((a) => a.question)).toEqual(['pet', 'street']);
  });

  it.each([
    ['no answers key', {}],
    ['answers null', { answers: null }],
    ['answers an object', { answers: PAIR[0] }],
    ['answers a string', { answers: 'pet,street' }],
    ['zero entries', { answers: [] }],
    ['one entry', { answers: [PAIR[0]] }],
    ['three entries', { answers: [...PAIR, entry('nickname', 'Dudi')] }],
    ['the same id twice', { answers: [entry('pet', 'Rex'), entry('pet', 'Max')] }],
    ['an unknown id', { answers: [entry('pet', 'Rex'), entry('school', 'Herzl')] }],
    ['an id with other case', { answers: [entry('Pet', 'Rex'), entry('street', 'Herzl')] }],
    ['an empty id', { answers: [entry('', 'Rex'), entry('street', 'Herzl')] }],
    ['an id that is not a string', { answers: [{ question: 1, answer: 'Rex' }, entry('street', 'Herzl')] }],
    ['an entry with no answer', { answers: [{ question: 'pet' }, entry('street', 'Herzl')] }],
    ['an answer that is not a string', { answers: [{ question: 'pet', answer: 12345 }, entry('street', 'Herzl')] }],
    ['an answer null', { answers: [{ question: 'pet', answer: null }, entry('street', 'Herzl')] }],
    ['an entry that is null', { answers: [null, entry('street', 'Herzl')] }],
    ['an entry that is a string', { answers: ['pet', 'street'] }],
    ['an extra key on the body', { answers: PAIR, userId: 'b0000000-0000-4000-8000-0000000000b2' }],
    ['an extra key on an entry', { answers: [{ ...PAIR[0], userId: 'b0000000-0000-4000-8000-0000000000b2' }, PAIR[1]] }],
    ['a body naming another user', { answers: PAIR, user_id: 'b0000000-0000-4000-8000-0000000000b2' }],
    ['the body is an array', PAIR],
    ['the body is null', null],
    ['the body is a string', 'pet'],
  ])('[F1.6 c2 c5] refuses %s', (_label, body) => {
    expect(ok(body)).toBe(false);
  });

  it('[F1.6 c2] an answer is 2 to 60 characters AFTER normalising: 1 is too short, 2 passes, 60 passes, 61 is too long', () => {
    expect(RECOVERY_ANSWER_MIN_LENGTH).toBe(2);
    expect(RECOVERY_ANSWER_MAX_LENGTH).toBe(60);
    expect(ok({ answers: [entry('pet', 'a'), PAIR[1]] })).toBe(false);
    expect(ok({ answers: [entry('pet', 'ab'), PAIR[1]] })).toBe(true);
    expect(ok({ answers: [entry('pet', hebrewLetters(60)), PAIR[1]] })).toBe(true);
    expect(ok({ answers: [entry('pet', hebrewLetters(61)), PAIR[1]] })).toBe(false);
  });

  it('[F1.6 c2 c7] the length is counted after normalising: spaces and punctuation do not count, and answers of only separators are empty', () => {
    expect(ok({ answers: [entry('pet', ' a - '), PAIR[1]] })).toBe(false);
    expect(ok({ answers: [entry('pet', ' a b '), PAIR[1]] })).toBe(true);
    expect(ok({ answers: [entry('pet', '   '), PAIR[1]] })).toBe(false);
    expect(ok({ answers: [entry('pet', '- - -'), PAIR[1]] })).toBe(false);
    expect(ok({ answers: [entry('pet', ''), PAIR[1]] })).toBe(false);
    // 60 letters hidden among separators still counts as 60; 61 does not pass however it is spaced
    expect(ok({ answers: [entry('pet', hebrewLetters(60).split('').join(' ')), PAIR[1]] })).toBe(true);
    expect(ok({ answers: [entry('pet', hebrewLetters(61).split('').join(' ')), PAIR[1]] })).toBe(false);
  });

  it('[F1.6 c2] a raw answer over 600 UTF-16 units is refused before it is normalised, even if it would normalise to 2 characters', () => {
    expect(RAW_ANSWER_MAX_UNITS).toBe(600);
    expect(ok({ answers: [entry('pet', ' '.repeat(598) + 'ab'), PAIR[1]] })).toBe(true);
    expect(ok({ answers: [entry('pet', ' '.repeat(599) + 'ab'), PAIR[1]] })).toBe(false);
    expect(ok({ answers: [entry('pet', 'a'.repeat(100_000)), PAIR[1]] })).toBe(false);
  });

  it('[F1.6 c2] hostile text is just text: markup, SQL, null bytes and control characters either pass as characters or are refused, never throw', () => {
    for (const raw of ['<script>alert(1)</script>', "'; drop table users; --", 'a\u0000b', '‮abc', '${7*7}', '{{constructor}}', '\\u0041\\u0042']) {
      expect(() => recoveryStoreRequest.safeParse({ answers: [entry('pet', raw), PAIR[1]] })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c4] the change request: the two current answers and a new valid pair, nothing else', () => {
  const NEW = [entry('nickname', 'Dudi'), entry('street', 'Herzl')];
  const ok = (body: unknown): boolean => recoveryChangeRequest.safeParse(body).success;

  it('[F1.6 c4] current pair and new pair pass; the two pairs may use different questions', () => {
    expect(ok({ current: PAIR, answers: NEW })).toBe(true);
    expect(ok({ current: PAIR, answers: PAIR })).toBe(true);
  });

  it('[F1.6 c4 c7] both pairs come out normalised', () => {
    const parsed = recoveryChangeRequest.parse({ current: [entry('pet', ' REX '), entry('street', 'Herzl')], answers: NEW });
    expect(parsed.current[0]?.answer).toBe('rex');
  });

  it.each([
    ['no current', { answers: NEW }],
    ['no new answers', { current: PAIR }],
    ['current with one entry', { current: [PAIR[0]], answers: NEW }],
    ['current with three entries', { current: [...PAIR, entry('nickname', 'Dudi')], answers: NEW }],
    ['current with the same id twice', { current: [entry('pet', 'Rex'), entry('pet', 'Max')], answers: NEW }],
    ['new answers with one entry', { current: PAIR, answers: [NEW[0]] }],
    ['new answers with the same id twice', { current: PAIR, answers: [entry('pet', 'Rex'), entry('pet', 'Max')] }],
    ['a new answer of 1 character', { current: PAIR, answers: [entry('pet', 'a'), NEW[1]] }],
    ['an extra key', { current: PAIR, answers: NEW, email: 'a@b.co' }],
    ['current null', { current: null, answers: NEW }],
  ])('[F1.6 c4 c2] refuses %s', (_label, body) => {
    expect(ok(body)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c14 VAL-003 VAL-002] the reset request is validated before any lookup', () => {
  const body = (over: Record<string, unknown> = {}) => ({ email: 'dana@example.com', answers: PAIR, password: 'סיסמה ארוכה 123', ...over });
  const ok = (value: unknown): boolean => recoveryResetRequest.safeParse(value).success;

  it('[F1.6 c14] a complete request passes, with a Hebrew password that has spaces', () => {
    expect(ok(body())).toBe(true);
    expect(ok(body({ password: 'עברית עם רווחים' }))).toBe(true);
  });

  it('[F1.6 c14 VAL-003] the password is 8 to 256 characters: 7 fails, 8 passes, 256 passes, 257 fails, empty fails', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(256);
    expect(ok(body({ password: 'a'.repeat(7) }))).toBe(false);
    expect(ok(body({ password: 'a'.repeat(8) }))).toBe(true);
    expect(ok(body({ password: 'a'.repeat(256) }))).toBe(true);
    expect(ok(body({ password: 'a'.repeat(257) }))).toBe(false);
    expect(ok(body({ password: '' }))).toBe(false);
  });

  it('[F1.6 c14 VAL-003] the password is counted in code points, not UTF-16 units: 8 emoji pass, 257 emoji fail', () => {
    expect(ok(body({ password: '😀'.repeat(8) }))).toBe(true);
    expect(ok(body({ password: '😀'.repeat(256) }))).toBe(true);
    expect(ok(body({ password: '😀'.repeat(257) }))).toBe(false);
  });

  it('[F1.6 c14 VAL-003] the password is not trimmed: 8 spaces are 8 characters, and leading and trailing spaces are kept', () => {
    expect(ok(body({ password: ' '.repeat(8) }))).toBe(true);
    const parsed = recoveryResetRequest.parse(body({ password: '  secret pass  ' }));
    expect(parsed.password).toBe('  secret pass  ');
    expect(ok(body({ password: ' ab ' }))).toBe(false);
  });

  it.each([
    ['no password', { password: undefined }],
    ['a password that is a number', { password: 12345678 }],
    ['a password null', { password: null }],
    ['no email', { email: undefined }],
    ['an empty email', { email: '' }],
    ['an email with no @', { email: 'danaexample.com' }],
    ['an email with no domain', { email: 'dana@' }],
    ['an email with no local part', { email: '@example.com' }],
    ['an email with a space inside', { email: 'da na@example.com' }],
    ['an email with two @', { email: 'a@@example.com' }],
    ['an email that is a number', { email: 12345 }],
    ['an email of 400 characters', { email: `${'a'.repeat(390)}@example.com` }],
    ['no answers', { answers: undefined }],
    ['zero answers', { answers: [] }],
    ['one answer', { answers: [PAIR[0]] }],
    ['three answers', { answers: [...PAIR, entry('nickname', 'Dudi')] }],
    ['the same question twice', { answers: [entry('pet', 'Rex'), entry('pet', 'Max')] }],
    ['an unknown question', { answers: [entry('pet', 'Rex'), entry('school', 'Herzl')] }],
    ['an answer of 1 character', { answers: [entry('pet', 'a'), PAIR[1]] }],
    ['an answer of 61 characters', { answers: [entry('pet', hebrewLetters(61)), PAIR[1]] }],
    ['an extra key on the body', { extra: true }],
    ['a user id on the body', { userId: 'b0000000-0000-4000-8000-0000000000b2' }],
    ['an extra key on an answer', { answers: [{ ...PAIR[0], hint: 'x' }, PAIR[1]] }],
  ])('[F1.6 c14] refuses %s', (_label, over) => {
    expect(ok(body(over))).toBe(false);
  });

  it('[F1.6 c14 VAL-002] the email is trimmed and the parse output has no surrounding space', () => {
    const parsed = recoveryResetRequest.parse(body({ email: '  Dana@Example.com  ' }));
    expect(parsed.email).toBe(parsed.email.trim());
    expect(parsed.email.toLowerCase()).toBe('dana@example.com');
  });

  it('[F1.6 c14 c7] the answers in the parse output are normalised', () => {
    const parsed = recoveryResetRequest.parse(body({ answers: [entry('pet', ' REX '), entry('street', "ג'ורג'")] }));
    expect(parsed.answers.map((a) => a.answer)).toEqual(['rex', 'גורג']);
  });

  it('[F1.6 c14] hostile inputs never throw: a 10 MB password, a prototype-polluting body, a deeply nested one', () => {
    expect(() => recoveryResetRequest.safeParse(body({ password: 'a'.repeat(10_000_000) }))).not.toThrow();
    expect(ok(body({ password: 'a'.repeat(10_000_000) }))).toBe(false);
    expect(ok(JSON.parse('{"__proto__":{"polluted":true},"email":"dana@example.com"}'))).toBe(false);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
    let nested: unknown = 'x';
    for (let i = 0; i < 2000; i += 1) nested = { a: nested };
    expect(() => recoveryResetRequest.safeParse(nested)).not.toThrow();
    expect(ok(nested)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F1.6 c3 c12 c13] the constants the server and the database share', () => {
  it('[F1.6 c1] three questions, ids pet, nickname, street, and exactly two answers', () => {
    expect([...RECOVERY_QUESTION_IDS]).toEqual(['pet', 'nickname', 'street']);
    expect(RECOVERY_ANSWER_COUNT).toBe(2);
  });

  it('[F1.6 c3] scrypt is N=2^15, r=8, p=1 (memory-hard parameters from the spec)', () => {
    expect(RECOVERY_SCRYPT).toEqual({ logN: 15, r: 8, p: 1 });
  });

  it('[F1.6 c12] the limits are the approved ones: handle 5 in 30 minutes locks 30 minutes, 15 in 24 hours locks 24 hours; IP 10 in 15 minutes locks 15 minutes', () => {
    expect(RECOVERY_LIMITS.handle).toEqual({
      shortFailures: 5,
      shortWindowSeconds: 1800,
      shortLockSeconds: 1800,
      longFailures: 15,
      longWindowSeconds: 86400,
      longLockSeconds: 86400,
    });
    expect(RECOVERY_LIMITS.ip).toEqual({ shortFailures: 10, shortWindowSeconds: 900, shortLockSeconds: 900 });
  });

  it('[F1.6 c13] the audit kinds are the ten approved ones, with the reset outcome kinds of Amendment 1', () => {
    expect([...RECOVERY_EVENT_KINDS].sort()).toEqual(
      [
        'answers_saved',
        'answers_changed',
        'change_failed',
        'change_limited',
        'reset_verified',
        'reset_completed',
        'reset_failed',
        'reset_limited',
        'reset_admin_failed',
        'reset_revoke_failed',
      ].sort(),
    );
  });
});
