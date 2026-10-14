import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHILD_BIRTH_DATE_FLOOR,
  CHILD_SEXES,
  JOURNEY_STAGES,
  MAX_CHILDREN,
  PARENT_GENDERS,
  REGISTRATION_ERROR_CODES,
  createRegistrationStep1Schema,
  fullNameSchema,
} from '../src/index.js';
import type { RegistrationStep1Input } from '../src/index.js';

// F1.3 pass a, criteria 1-5. Derived from spec.md only. `today` is always fixed here.
const TODAY = '2026-06-15';
const DUE_MIN = '2026-05-16'; // today - 30 days (DR-1)
const DUE_MAX = '2027-04-11'; // today + 300 days (DR-1)

const parts = (iso: string) => {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
};
const empty = { day: '', month: '', year: '' };
const child = (over: Partial<RegistrationStep1Input['children'][number]> = {}) => ({
  name: 'נועה',
  sex: 'girl',
  birthDate: parts('2024-02-29'),
  ...over,
});
const form = (over: Partial<RegistrationStep1Input> = {}): RegistrationStep1Input => ({
  stages: ['planning'],
  fullName: 'דנה כהן',
  parentGender: undefined,
  dueDate: empty,
  children: [],
  ...over,
});

const schema = createRegistrationStep1Schema(TODAY);
/** All stable issue codes of a failed parse (codes, never text). */
function codes(input: unknown, s: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } } = schema): string[] {
  const r = s.safeParse(input);
  if (r.success) return [];
  const blob = JSON.stringify(r.error?.issues ?? []);
  return REGISTRATION_ERROR_CODES.filter((c) => blob.includes(`"${c}"`));
}
const ok = (input: unknown) => schema.safeParse(input).success;

describe('F1.3 criterion 1 [VAL-001 · AC-002] full name', () => {
  const cp = (n: number, ch = 'x') => ch.repeat(n);
  const ALEF_NIQQUD = 'אְ';
  const table: [string, string, boolean][] = [
    ['one Hebrew letter', 'א', false],
    ['padded two letters', '  אב  ', true],
    ['60 code points', cp(60), true],
    ['61 code points', cp(61), false],
    ['leading space + 1 letter = 1 after trim', ' א', false],
    ['tab + letter = 2 (tab is not trimmed)', '\tא', true],
    ['single emoji (1 code point, 2 UTF-16 units)', '😀', false],
    ['31 emoji', '😀'.repeat(31), true],
    ['60 emoji', '😀'.repeat(60), true],
    ['61 emoji', '😀'.repeat(61), false],
    ['letter + niqqud = 2 code points', ALEF_NIQQUD, true],
    ['niqqud alone = 1', 'ְ', false],
    ['60 code points with niqqud', ALEF_NIQQUD.repeat(30), true],
    ['61 code points with niqqud', ALEF_NIQQUD.repeat(30) + 'א', false],
    ['empty', '', false],
    ['spaces only', '      ', false],
    ['single tab', '\t', false],
    ['61 chars between spaces', ' ' + cp(61) + ' ', false],
    ['hostile text is data', "Rob'); drop table users;--", true],
  ];
  it.each(table)('[VAL-001 · AC-002] %s', (_label, input, accepted) => {
    expect(fullNameSchema.safeParse(input).success).toBe(accepted);
  });
  it('[VAL-001] output is the space-trimmed string, tab kept', () => {
    expect(fullNameSchema.parse('  אב  ')).toBe('אב');
    expect(fullNameSchema.parse('\tא')).toBe('\tא');
  });
  it('[VAL-001] non-string input is refused', () => {
    for (const bad of [null, undefined, 42, {}, ['אב']]) {
      expect(fullNameSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('F1.3 criterion 2 [VAL-039 · AC-089 · VAL-006] stage, gender, child sex', () => {
  const valid: string[][] = [
    ['planning'],
    ['pregnant'],
    ['has_child'],
    ['planning', 'has_child'],
    ['pregnant', 'has_child'],
  ];
  it.each(valid)('[VAL-039 · AC-089] allowed combination %s', (...stages) => {
    const children = stages.includes('has_child') ? [child()] : [];
    expect(ok(form({ stages, children }))).toBe(true);
  });
  it('[VAL-039 · AC-089] none, planning+pregnant, unknown and repeated values are refused', () => {
    expect(codes(form({ stages: [] }))).toContain('stage_required');
    expect(codes(form({ stages: ['planning', 'pregnant'] }))).toContain('stage_conflict');
    expect(ok(form({ stages: ['planning', 'pregnant', 'has_child'], children: [child()] }))).toBe(false);
    expect(ok(form({ stages: ['toddler'] }))).toBe(false);
    expect(ok(form({ stages: ['planning', 'planning'] }))).toBe(false);
    expect(ok(form({ stages: ['PLANNING'] }))).toBe(false);
    expect(ok(form({ stages: [''] }))).toBe(false);
  });
  it('[VAL-006] parent gender: each listed value passes, absent/empty -> null, others refused', () => {
    for (const g of PARENT_GENDERS) {
      const r = schema.safeParse(form({ parentGender: g }));
      expect(r.success && r.data.parentGender).toBe(g);
    }
    const absent = schema.safeParse(form({ parentGender: undefined }));
    expect(absent.success && absent.data.parentGender).toBeNull();
    const blank = schema.safeParse(form({ parentGender: '' }));
    expect(blank.success && blank.data.parentGender).toBeNull();
    for (const bad of ['Woman', 'female', 'unknown', ' ']) {
      expect(codes(form({ parentGender: bad }))).toContain('parent_gender_invalid');
    }
  });
  it('[VAL-006] child sex: three values pass, missing and others refused', () => {
    for (const sex of CHILD_SEXES) {
      expect(ok(form({ stages: ['has_child'], children: [child({ sex })] }))).toBe(true);
    }
    expect(codes(form({ stages: ['has_child'], children: [child({ sex: '' })] }))).toContain('child_sex_required');
    for (const bad of ['Boy', 'male', 'other']) {
      expect(codes(form({ stages: ['has_child'], children: [child({ sex: bad })] }))).toContain('child_sex_invalid');
    }
  });
  it('[VAL-039] the value lists are the three stages and three sexes', () => {
    expect([...JOURNEY_STAGES]).toEqual(['planning', 'pregnant', 'has_child']);
    expect([...CHILD_SEXES]).toEqual(['boy', 'girl', 'unknown']);
  });
});

describe('F1.3 criterion 3 [FR-REG-002 · VAL-005 · VAL-006] child and birth date', () => {
  const withBirth = (birthDate: { day: string; month: string; year: string }) =>
    form({ stages: ['has_child'], children: [child({ birthDate })] });

  it('[VAL-005] real calendar dates: leap day, not-leap day, 31 April', () => {
    expect(ok(withBirth({ day: '29', month: '2', year: '2024' }))).toBe(true);
    expect(codes(withBirth({ day: '29', month: '2', year: '2025' }))).toContain('birth_date_invalid');
    expect(codes(withBirth({ day: '31', month: '4', year: '2025' }))).toContain('birth_date_invalid');
    expect(codes(withBirth({ day: '0', month: '1', year: '2025' }))).toContain('birth_date_invalid');
    expect(codes(withBirth({ day: '1', month: '13', year: '2025' }))).toContain('birth_date_invalid');
  });
  it('[VAL-005] today passes, tomorrow is future, floor 1900-01-01 passes, a day before is out of range', () => {
    expect(ok(withBirth(parts(TODAY)))).toBe(true);
    expect(codes(withBirth(parts('2026-06-16')))).toContain('birth_date_future');
    expect(CHILD_BIRTH_DATE_FLOOR).toBe('1900-01-01');
    expect(ok(withBirth(parts('1900-01-01')))).toBe(true);
    expect(codes(withBirth(parts('1899-12-31')))).toContain('birth_date_out_of_range');
  });
  it('[FR-REG-002 · VAL-005] name, sex and birth date are each required; empty birth date', () => {
    expect(codes(form({ stages: ['has_child'], children: [child({ name: '   ' })] }))).toContain('child_name_required');
    expect(codes(form({ stages: ['has_child'], children: [child({ name: 'x'.repeat(61) })] }))).toContain('child_name_length');
    expect(ok(form({ stages: ['has_child'], children: [child({ name: 'x'.repeat(60) })] }))).toBe(true);
    expect(ok(form({ stages: ['has_child'], children: [child({ name: '😀' })] }))).toBe(true); // DR-2: min 1 code point
    expect(codes(withBirth(empty))).toContain('birth_date_required');
  });
  it('[VAL-005 · Q7] output is YYYY-MM-DD; no leading zero and surrounding spaces accepted; non-ASCII digits refused', () => {
    const r = schema.safeParse(withBirth({ day: ' 5 ', month: '3', year: '2024 ' }));
    expect(r.success && r.data.children[0]?.birthDate).toBe('2024-03-05');
    const r2 = schema.safeParse(withBirth({ day: '05', month: '03', year: '2024' }));
    expect(r2.success && r2.data.children[0]?.birthDate).toBe('2024-03-05');
    expect(ok(withBirth({ day: '٥', month: '3', year: '2024' }))).toBe(false);
    expect(ok(withBirth({ day: '5', month: '3', year: '24' }))).toBe(false);
    expect(ok(withBirth({ day: '1e1', month: '3', year: '2024' }))).toBe(false);
  });
  it('[VAL-005] "today" is injected: the same date flips with the injected value', () => {
    const early = createRegistrationStep1Schema('2024-01-01');
    expect(early.safeParse(withBirth({ day: '1', month: '6', year: '2024' })).success).toBe(false);
    expect(ok(withBirth({ day: '1', month: '6', year: '2024' }))).toBe(true);
  });
});

describe('F1.3 criterion 4 [VAL-040 · AC-090 · FR-REG-002] children count and due date', () => {
  const kids = (n: number) => Array.from({ length: n }, (_, i) => child({ name: `ילד ${i + 1}` }));

  it('[VAL-040 · AC-090] 1 and 10 children pass, 0 and 11 fail, with has_child', () => {
    expect(ok(form({ stages: ['has_child'], children: kids(1) }))).toBe(true);
    expect(ok(form({ stages: ['has_child'], children: kids(10) }))).toBe(true);
    expect(codes(form({ stages: ['has_child'], children: [] }))).toContain('children_required');
    expect(codes(form({ stages: ['has_child'], children: kids(11) }))).toContain('children_too_many');
  });
  it('[VAL-040] without has_child the output has no children, even with invalid ones in the input (at most 10: F1.4 criterion 2 rejects more, raw)', () => {
    const r = schema.safeParse(form({ stages: ['planning'], children: [child({ sex: 'bogus', name: '' }), ...kids(9)] }));
    expect(r.success).toBe(true);
    expect(r.success && r.data.children).toEqual([]);
  });
  it('[FR-REG-002] due date: all empty -> null, partial refused, complete within DR-1 window', () => {
    const r = schema.safeParse(form({ stages: ['pregnant'] }));
    expect(r.success && r.data.dueDate).toBeNull();
    expect(codes(form({ stages: ['pregnant'], dueDate: { day: '1', month: '', year: '' } }))).toContain('due_date_partial');
    expect(codes(form({ stages: ['pregnant'], dueDate: { day: '', month: '', year: '2026' } }))).toContain('due_date_partial');
    expect(codes(form({ stages: ['pregnant'], dueDate: { day: '31', month: '2', year: '2027' } }))).toContain('due_date_invalid');
    const mid = schema.safeParse(form({ stages: ['pregnant'], dueDate: parts('2026-12-01') }));
    expect(mid.success && mid.data.dueDate).toBe('2026-12-01');
  });
  it('[FR-REG-002 · DR-1] due date window edges: today-30 and today+300 pass, one day beyond fails', () => {
    for (const iso of [DUE_MIN, DUE_MAX, TODAY]) {
      const r = schema.safeParse(form({ stages: ['pregnant'], dueDate: parts(iso) }));
      expect(r.success && r.data.dueDate).toBe(iso);
    }
    for (const iso of ['2026-05-15', '2027-04-12']) {
      expect(codes(form({ stages: ['pregnant'], dueDate: parts(iso) }))).toContain('due_date_out_of_range');
    }
  });
  it('[FR-REG-002] without pregnant the output has no due date, even if filled or partly filled', () => {
    for (const stages of [['planning'], ['has_child']]) {
      const children = stages.includes('has_child') ? [child()] : [];
      for (const dueDate of [parts('2026-12-01'), { day: '9', month: '', year: '' }]) {
        const r = schema.safeParse(form({ stages, children, dueDate }));
        expect(r.success).toBe(true);
        expect(r.success && r.data.dueDate).toBeNull();
      }
    }
  });
  it('[AC-090] pregnant together with has_child keeps both sections in the output', () => {
    const r = schema.safeParse(form({ stages: ['pregnant', 'has_child'], dueDate: parts('2026-12-01'), children: kids(2) }));
    expect(r.success && r.data.dueDate).toBe('2026-12-01');
    expect(r.success && r.data.children.length).toBe(2);
  });
});

describe('F1.3 criterion 5 [conventions Shared · S2] portability', () => {
  afterEach(() => {
    vi.doUnmock('../src/constants/index.js');
    vi.doUnmock('../src/constants/registration.js');
    vi.resetModules();
  });

  it('[S2] changing MAX_CHILDREN in the shared constant changes what the schema accepts', async () => {
    const real = await import('../src/constants/registration.js');
    expect(real.MAX_CHILDREN).toBe(10); // baseline: 10 passes, 11 fails (criterion 4)
    vi.resetModules();
    vi.doMock('../src/constants/registration.js', async (orig) => ({
      ...(await orig<typeof import('../src/constants/registration.js')>()),
      MAX_CHILDREN: 3,
    }));
    const mod = await import('../src/validation/registration-step1.js');
    const s = mod.createRegistrationStep1Schema(TODAY);
    const kids = (n: number) => Array.from({ length: n }, () => child());
    expect(s.safeParse(form({ stages: ['has_child'], children: kids(3) })).success).toBe(true);
    expect(s.safeParse(form({ stages: ['has_child'], children: kids(4) })).success).toBe(false);
  });

  it('[S2] changing the due-date window constant changes what the schema accepts', async () => {
    vi.resetModules();
    vi.doMock('../src/constants/registration.js', async (orig) => ({
      ...(await orig<typeof import('../src/constants/registration.js')>()),
      DUE_DATE_DAYS_AFTER_TODAY: 10,
    }));
    const mod = await import('../src/validation/registration-step1.js');
    const s = mod.createRegistrationStep1Schema(TODAY);
    expect(s.safeParse(form({ stages: ['pregnant'], dueDate: parts('2026-06-25') })).success).toBe(true);
    expect(s.safeParse(form({ stages: ['pregnant'], dueDate: parts('2026-06-26') })).success).toBe(false);
  });

  it('[S2] the exported bound is the one the criteria state', () => {
    expect(MAX_CHILDREN).toBe(10);
  });
});
