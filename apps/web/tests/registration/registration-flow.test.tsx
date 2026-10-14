// F1.3 pass c: criteria 7 (no-children half), 9, 10, 11, 12 (placeholder), 13, 14, 15 (unit level); and the review
// follow-up (findings.md 1): the three range texts through the UI.
// Derived from .work/register-profile-step/spec.md and the interface given for pass c. Pass d (children) is not tested.
// Runs from the repo root or from apps/web: `npx vitest run apps/web/tests/registration/registration-flow.test.tsx`.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { REGISTRATION_ERROR_CODES } from '@nestly/shared';
import { RegistrationFlow } from '@/features/registration/RegistrationFlow';
import { errorTextFor, registrationErrorTexts } from '@/features/registration/error-texts';
import { mountAt } from '../app/util';

const TODAY = '2026-10-14';
// DR-1 window for TODAY, counted by hand: 14.10.2026 - 30 days = 14.9.2026; + 300 days = 10.8.2027 (D.M.YYYY, no leading zeros).
const DUE_RANGE_TEXT = 'התאריך צריך להיות בין 14.9.2026 ל-10.8.2027';
const GENERIC = 'משהו השתבש. אפשר לנסות שוב';
const STEP2: { pathname: string; state: { registrationStep: number } } = { pathname: '/register', state: { registrationStep: 2 } };

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="path">{location.pathname}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        probe-back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        probe-forward
      </button>
      <button type="button" onClick={() => void navigate('/register')}>
        probe-register
      </button>
    </div>
  );
}

function renderFlow(initialEntries: (string | typeof STEP2)[] = ['/register'], initialIndex?: number) {
  return render(
    <MemoryRouter initialEntries={initialEntries} {...(initialIndex === undefined ? {} : { initialIndex })}>
      <RegistrationFlow today={TODAY} />
      <Probe />
    </MemoryRouter>,
  );
}

const user = () => userEvent.setup();
const stageGroup = () => screen.getByRole('group', { name: 'השלב במסע' });
const stage = (name: string) => within(stageGroup()).getByRole('checkbox', { name: new RegExp(name) });
const nameField = () => screen.getByLabelText(/^שם מלא/);
const genderField = () => screen.getByLabelText(/^מין ההורה/);
const dueGroup = () => screen.getByRole('group', { name: /תאריך לידה משוער/ });
const dueField = (n: 'יום' | 'חודש' | 'שנה') => within(dueGroup()).getByLabelText(n);
const next = () => screen.getByRole('button', { name: 'המשך' });
const onStep1 = () => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');
const onStep2 = () => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');

/** Text of what an invalid control (or its fieldset) is described by. */
function describedText(el: HTMLElement): string {
  const holder = el.getAttribute('aria-describedby') ? el : el.closest('fieldset');
  const ids = (holder?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

async function fillValid(u: ReturnType<typeof user>, fullName = 'דנה כהן') {
  await u.click(stage('מתכננים'));
  await u.type(nameField(), fullName);
}

describe('F1.3 criterion 7 (no-children half) [AC-089 · FR-REG-002 · FR-REG-003] fields open only when ticked', () => {
  it('[AC-089][FR-REG-002] nothing ticked: no due-date field; pregnant opens three optional fields; planning opens nothing; unticking removes them and ticking again restores the values (Q3)', async () => {
    const u = user();
    renderFlow();
    onStep1();
    expect(screen.queryByRole('group', { name: /תאריך לידה משוער/ })).toBeNull();
    expect(screen.queryByLabelText('יום')).toBeNull();

    await u.click(stage('מתכננים'));
    expect(screen.queryByLabelText('יום')).toBeNull();
    expect(screen.queryByRole('button', { name: 'הוספת ילד נוסף' })).toBeNull();

    await u.click(stage('בהריון'));
    expect(dueGroup()).toHaveTextContent('לא חובה');
    for (const n of ['יום', 'חודש', 'שנה'] as const) expect(dueField(n)).toBeInTheDocument();
    await u.type(dueField('יום'), '1');
    await u.type(dueField('חודש'), '12');
    await u.type(dueField('שנה'), '2026');

    await u.click(stage('בהריון')); // untick
    expect(screen.queryByLabelText('יום')).toBeNull();
    expect(screen.queryByRole('group', { name: /תאריך לידה משוער/ })).toBeNull();

    await u.click(stage('בהריון')); // tick again, same page
    expect(dueField('יום')).toHaveValue('1');
    expect(dueField('חודש')).toHaveValue('12');
    expect(dueField('שנה')).toHaveValue('2026');
  });
});

describe('F1.3 criterion 9 [AC-002 · ERR-003] invalid blocks the step, errors appear on submit', () => {
  it('[AC-002][ERR-003] no message before the first "המשך"; then no stage + empty name: stays on step 1, aria-invalid, message linked, focus on the first invalid field', async () => {
    const u = user();
    renderFlow();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body).not.toHaveTextContent('יש לבחור לפחות אפשרות אחת');
    expect(document.body).not.toHaveTextContent('יש למלא שם מלא');
    for (const el of [nameField(), ...within(stageGroup()).getAllByRole('checkbox')]) {
      expect(el).not.toHaveAttribute('aria-invalid', 'true');
    }

    await u.click(next());
    onStep1();
    expect(screen.queryByText('שלב 2 מתוך 2')).toBeNull();
    for (const box of within(stageGroup()).getAllByRole('checkbox')) expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(stage('מתכננים'))).toContain('יש לבחור לפחות אפשרות אחת');
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(nameField())).toContain('יש למלא שם מלא');
    await waitFor(() => expect(stageGroup().contains(document.activeElement)).toBe(true)); // first in DOM order
  });

  it('[AC-002][ERR-003] a one-character name: the length message, focus on the name; a message clears as soon as its field becomes valid', async () => {
    const u = user();
    renderFlow();
    await u.click(stage('מתכננים'));
    await u.type(nameField(), 'א');
    await u.click(next());
    onStep1();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(nameField())).toContain('שם מלא צריך להכיל 2 עד 60 תווים');
    await waitFor(() => expect(nameField()).toHaveFocus());
    expect(stage('מתכננים')).not.toHaveAttribute('aria-invalid', 'true');

    await u.type(nameField(), 'ב');
    await waitFor(() => expect(nameField()).not.toHaveAttribute('aria-invalid', 'true'));
    expect(document.body).not.toHaveTextContent('שם מלא צריך להכיל 2 עד 60 תווים');
  });

  it('[AC-002][ERR-003] a partly filled due date blocks; an impossible date (31.2) blocks; complete and in range passes', async () => {
    const u = user();
    renderFlow();
    await u.click(stage('בהריון'));
    await u.type(nameField(), 'דנה כהן');
    await u.type(dueField('יום'), '5');
    await u.click(next());
    onStep1();
    for (const n of ['יום', 'חודש', 'שנה'] as const) expect(dueField(n)).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(dueField('יום'))).toContain('יש להשלים את התאריך או להשאיר אותו ריק');
    await waitFor(() => expect(dueGroup().contains(document.activeElement)).toBe(true));

    await u.clear(dueField('יום'));
    await u.type(dueField('יום'), '31');
    await u.type(dueField('חודש'), '2');
    await u.type(dueField('שנה'), '2027');
    await u.click(next());
    onStep1();
    expect(describedText(dueField('יום'))).toContain('התאריך אינו תקין. יש לבדוק יום, חודש ושנה');

    await u.clear(dueField('יום'));
    await u.type(dueField('יום'), '1');
    await u.clear(dueField('חודש'));
    await u.type(dueField('חודש'), '12');
    await u.clear(dueField('שנה'));
    await u.type(dueField('שנה'), '2026');
    await u.click(next());
    onStep2();
  });

  it('[ERR-003] no Zod/English text reaches the DOM after a failed submit', async () => {
    const u = user();
    renderFlow();
    await u.click(next());
    expect(document.body.textContent ?? '').not.toMatch(/Invalid|Required|Expected|String must|Too (small|big)|issue/i);
  });

  it('[VAL-040 · ERR-003][review 1] a due date outside today-30..today+300 shows the range, built from the fixed today; the boundary day passes', async () => {
    const u = user();
    renderFlow();
    await u.click(stage('בהריון'));
    await u.type(nameField(), 'דנה כהן');
    // 13.9.2026 is one day before the window (14.10.2026 - 31 days).
    await u.type(dueField('יום'), '13');
    await u.type(dueField('חודש'), '9');
    await u.type(dueField('שנה'), '2026');
    await u.click(next());
    onStep1();
    expect(dueField('יום')).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(dueField('יום'))).toContain(DUE_RANGE_TEXT);
    expect(describedText(dueField('יום'))).not.toContain(GENERIC);

    // 14.9.2026 is the first day inside the window.
    await u.clear(dueField('יום'));
    await u.type(dueField('יום'), '14');
    await u.click(next());
    onStep2();
  });
});

describe('F1.3 criterion 10 [ERR-003 · ux-copy-he] error text map', () => {
  const DR4: [string, string][] = [
    ['stage_required', 'יש לבחור לפחות אפשרות אחת'],
    ['full_name_required', 'יש למלא שם מלא'],
    ['full_name_length', 'שם מלא צריך להכיל 2 עד 60 תווים'],
    ['child_name_required', 'יש למלא שם'],
    ['child_sex_required', 'יש לבחור מין'],
    ['birth_date_required', 'יש למלא תאריך לידה'],
    ['birth_date_invalid', 'התאריך אינו תקין. יש לבדוק יום, חודש ושנה'],
    ['birth_date_future', 'תאריך הלידה לא יכול להיות בעתיד'],
    ['due_date_partial', 'יש להשלים את התאריך או להשאיר אותו ריק'],
    // Decided at the review (decisions/2026-10.md "F1.3 review"): the three range texts.
    ['due_date_out_of_range', DUE_RANGE_TEXT],
    ['child_name_length', 'שם צריך להכיל עד 60 תווים'],
    ['birth_date_out_of_range', 'התאריך צריך להיות מ-1900 ואילך'],
  ];
  it.each(DR4)('[ERR-003] %s -> its text, for today 2026-10-14', (code, text) => {
    expect(Reflect.apply(errorTextFor, undefined, [code, TODAY])).toBe(text);
  });

  it('[ERR-003][review 1] the due-date range follows "today" (here 2024-03-01, a leap year: 31.1.2024 to 26.12.2024)', () => {
    expect(Reflect.apply(errorTextFor, undefined, ['due_date_out_of_range', '2024-03-01'])).toBe(
      'התאריך צריך להיות בין 31.1.2024 ל-26.12.2024',
    );
    const map: unknown = registrationErrorTexts(TODAY);
    expect(typeof map).toBe('object');
    expect(map).not.toBeNull();
  });

  it.each(['stage_invalid', 'stage_conflict', 'parent_gender_invalid', 'children_required', 'children_too_many', 'child_sex_invalid'])(
    '[ERR-003] %s (a code the UI cannot produce) gets the generic message',
    (code) => {
      expect(Reflect.apply(errorTextFor, undefined, [code, TODAY])).toBe(GENERIC);
    },
  );

  it('[ERR-003] an unmapped code gets the generic message; no code ever yields an empty or English text', () => {
    expect(Reflect.apply(errorTextFor, undefined, ['no_such_code', TODAY])).toBe(GENERIC);
    for (const code of REGISTRATION_ERROR_CODES) {
      const text: unknown = Reflect.apply(errorTextFor, undefined, [code, TODAY]);
      expect(typeof text).toBe('string');
      expect(String(text).length).toBeGreaterThan(0);
      expect(String(text)).not.toMatch(/[A-Za-z]/);
    }
  });
});

describe('F1.3 criterion 11 [VAL-006 · FR-REG-002 · AC-017 · BR-068] optional stays optional; no extra fields', () => {
  it('[VAL-006][AC-017] an empty parent gender and an empty due date raise no error and the step advances', async () => {
    const u = user();
    renderFlow();
    await u.click(stage('בהריון'));
    await u.type(nameField(), 'דנה כהן');
    expect(genderField()).toHaveValue('');
    await u.click(next());
    onStep2();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('[BR-068][FR-REG-002] step 1 has no email, password, phone or parent birth-date field', async () => {
    const u = user();
    const { container } = renderFlow();
    await u.click(stage('בהריון'));
    expect(container.querySelector('input[type="email"], input[type="password"], input[type="tel"]')).toBeNull();
    expect(screen.queryByLabelText(/אימייל|דוא"ל|דואר|סיסמה|טלפון|נייד/)).toBeNull();
    expect(screen.queryAllByLabelText(/תאריך לידה(?! משוער)/)).toHaveLength(0);
    expect(screen.queryByRole('group', { name: /תאריך לידה(?! משוער)/ })).toBeNull();
  });
});

describe('F1.3 criterion 12 (placeholder half) [FR-REG-002]', () => {
  it('[FR-REG-002] a valid "המשך" shows the step-2 placeholder on /register', async () => {
    const u = user();
    renderFlow();
    await fillValid(u);
    await u.click(next());
    onStep2();
    expect(screen.getByText('שלב 2 מתוך 2')).toBeInTheDocument();
    expect(screen.getByText('המסך הזה ייפתח בקרוב.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חזרה' })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/register');
  });
});

describe('F1.3 criterion 13 [Q1] back keeps the data; leaving discards', () => {
  async function fillAll(u: ReturnType<typeof user>) {
    await u.click(stage('בהריון'));
    await u.type(nameField(), 'דנה כהן');
    await u.selectOptions(genderField(), 'woman');
    await u.type(dueField('יום'), '1');
    await u.type(dueField('חודש'), '12');
    await u.type(dueField('שנה'), '2026');
  }
  function expectIntact() {
    onStep1();
    expect(stage('בהריון')).toBeChecked();
    expect(stage('מתכננים')).not.toBeChecked();
    expect(nameField()).toHaveValue('דנה כהן');
    expect(genderField()).toHaveValue('woman');
    expect(dueField('יום')).toHaveValue('1');
    expect(dueField('חודש')).toHaveValue('12');
    expect(dueField('שנה')).toHaveValue('2026');
    expect(screen.getByTestId('path')).toHaveTextContent('/register');
  }

  it('[Q1] both the in-app "חזרה" and the browser Back return to step 1 with every value intact; the URL stays /register', async () => {
    const u = user();
    renderFlow();
    await fillAll(u);
    await u.click(next());
    onStep2();
    expect(screen.getByTestId('path')).toHaveTextContent('/register');
    await u.click(screen.getByRole('button', { name: 'חזרה' }));
    expectIntact();

    await u.click(next());
    onStep2();
    await u.click(screen.getByRole('button', { name: 'probe-back' })); // the browser Back
    expectIntact();
  });

  it('[Q1] "חזרה" on step 1 goes to /, and coming back to /register shows an empty form (through the whole app)', async () => {
    const u = user();
    await mountAt('/register');
    await u.click(stage('מתכננים'));
    await u.type(nameField(), 'שם שלא יישמר');
    // On step 1 "חזרה" leaves for another route, so it is a link.
    await u.click(screen.getByRole('link', { name: 'חזרה' }));
    await screen.findByRole('heading', { level: 1, name: 'הצטרפות ל-Nestly' });
    expect(window.location.pathname).toBe('/');
    await u.click(screen.getByRole('link', { name: 'יצירת חשבון חדש' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטים אישיים' });
    expect(nameField()).toHaveValue('');
    expect(stage('מתכננים')).not.toBeChecked();
  });
});

describe('F1.3 criterion 14 [Q1] reload', () => {
  it('[Q1] a reload on step 1 or on step 2 shows step 1, empty', () => {
    const { unmount } = renderFlow(['/register', STEP2], 1); // reload while on step 2: history persists, memory does not
    onStep1();
    expect(screen.queryByText('שלב 2 מתוך 2')).toBeNull();
    expect(nameField()).toHaveValue('');
    expect(stage('מתכננים')).not.toBeChecked();
    expect(stage('בהריון')).not.toBeChecked();
    unmount();
    renderFlow();
    onStep1();
    expect(nameField()).toHaveValue('');
  });

  it('[Q1] step 2 never renders without parsed data, including after a reload followed by the browser Forward', async () => {
    const u = user();
    renderFlow(['/register', STEP2], 0);
    onStep1();
    await u.click(screen.getByRole('button', { name: 'probe-forward' }));
    onStep1();
    expect(screen.queryByText('שלב 2 מתוך 2')).toBeNull();
    expect(screen.queryByText('המסך הזה ייפתח בקרוב.')).toBeNull();
  });
});

describe('F1.3 criterion 15 (unit level) [NFR-PRIV-001 · minors] data stays in the tab', () => {
  it('[NFR-PRIV-001] after filling every field and reaching step 2: no storage, cookie, fetch, XHR, beacon or console output holds the values', async () => {
    const SECRET_NAME = 'תמרהייחודית';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));

    const u = user();
    renderFlow();
    await u.click(stage('בהריון'));
    await u.type(nameField(), SECRET_NAME);
    await u.selectOptions(genderField(), 'woman');
    await u.type(dueField('יום'), '1');
    await u.type(dueField('חודש'), '12');
    await u.type(dueField('שנה'), '2026');
    await u.click(next());
    onStep2();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const dump = (s: Storage) => JSON.stringify(Object.fromEntries(Object.keys(s).map((k) => [k, s.getItem(k)])));
    for (const blob of [dump(localStorage), dump(sessionStorage), document.cookie]) {
      expect(blob).not.toContain(SECRET_NAME);
      expect(blob).not.toContain('2026-12-01');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET_NAME);
    }
  });
});
