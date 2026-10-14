// F1.3 pass d (unit): criterion 7 (has-child half), 8 (children cards), 9 (child error cases); and the review follow-up
// (findings.md 1, 6, 8). Derived from .work/register-profile-step/spec.md, the interface given for pass d and the review
// decisions. No type assertions.
// Runs from the repo root or from apps/web: `npx vitest run apps/web/tests/registration/registration-children.test.tsx`.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { RegistrationFlow } from '@/features/registration/RegistrationFlow';

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegistrationFlow today="2026-10-14" />
    </MemoryRouter>,
  );
}

type User = ReturnType<typeof userEvent.setup>;
const stage = (name: string) =>
  within(screen.getByRole('group', { name: 'השלב במסע' })).getByRole('checkbox', { name: new RegExp(name) });
const HAS_CHILD = 'יש לנו ילד או ילדה';
const addButton = () => screen.getByRole('button', { name: 'הוספת ילד נוסף' });
const card = (name: string) => screen.getByRole('group', { name });
const cardNameField = (name: string) => within(card(name)).getByLabelText('שם');
const cardSex = (name: string) => within(card(name)).getByLabelText('מין');
const cardDate = (name: string) => within(card(name)).getByRole('group', { name: 'תאריך לידה' });
const cardDay = (name: string) => within(cardDate(name)).getByLabelText('יום');
const allCards = () => screen.queryAllByRole('group', { name: /^ילד או ילדה \d+$/ });
const removeButtons = () => screen.queryAllByRole('button', { name: /^הסרת הפרטים של/ });
const next = () => screen.getByRole('button', { name: 'המשך' });
const fullName = () => screen.getByLabelText(/^שם מלא/);

function describedText(el: HTMLElement): string {
  const holder = el.getAttribute('aria-describedby') ? el : el.closest('fieldset');
  const ids = (holder?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

/** Every control of one card that can carry an error. */
function controlsOf(name: string): HTMLElement[] {
  return [
    cardNameField(name),
    cardSex(name),
    ...['יום', 'חודש', 'שנה'].map((n) => within(cardDate(name)).getByLabelText(n)),
  ];
}
const invalidIn = (name: string) => controlsOf(name).filter((c) => c.getAttribute('aria-invalid') === 'true');
const alertsIn = (name: string) => within(card(name)).queryAllByRole('alert');

async function setDate(u: User, cardName: string, d: string, m: string, y: string) {
  for (const [label, value] of [
    ['יום', d],
    ['חודש', m],
    ['שנה', y],
  ] as const) {
    const field = within(cardDate(cardName)).getByLabelText(label);
    await u.clear(field);
    await u.type(field, value);
  }
}

describe('F1.3 criterion 7 (has-child half) [AC-089 · FR-REG-002 · FR-REG-003]', () => {
  it('[AC-089][FR-REG-003] children show only when ticked: one empty card and the add button; unticking removes them; ticking again restores the values (Q3)', async () => {
    const u = userEvent.setup();
    renderFlow();
    expect(allCards()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'הוספת ילד נוסף' })).toBeNull();
    await u.click(stage('מתכננים'));
    expect(allCards()).toHaveLength(0);
    await u.click(stage('מתכננים')); // untick

    await u.click(stage(HAS_CHILD));
    expect(allCards()).toHaveLength(1);
    expect(addButton()).toBeInTheDocument();
    expect(cardNameField('ילד או ילדה 1')).toHaveValue('');
    expect(cardSex('ילד או ילדה 1')).toHaveValue('');
    const options = within(cardSex('ילד או ילדה 1')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['בחירה', 'בן', 'בת', 'עוד לא ידוע']);
    for (const n of ['יום', 'חודש', 'שנה']) expect(within(cardDate('ילד או ילדה 1')).getByLabelText(n)).toHaveValue('');
    expect(removeButtons()).toHaveLength(0);

    await u.type(cardNameField('ילד או ילדה 1'), 'נועה');
    expect(card('נועה')).toBeInTheDocument(); // the heading is the typed name
    await u.click(stage(HAS_CHILD)); // untick
    expect(allCards()).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'נועה' })).toBeNull();
    await u.click(stage(HAS_CHILD)); // tick again
    expect(cardNameField('נועה')).toHaveValue('נועה');
  });
});

describe('F1.3 criterion 8 [FR-REG-002 · FR-REG-003 · VAL-040 · AC-090] children cards', () => {
  it('[FR-REG-003] add moves focus to the new name; remove buttons need 2+ cards, keep the others\' values and move focus to the add button', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(cardNameField('ילד או ילדה 1'), 'נועה');
    await u.click(addButton());
    expect(allCards()).toHaveLength(1); // the second card is still "ילד או ילדה 2"
    expect(card('ילד או ילדה 2')).toBeInTheDocument();
    expect(cardNameField('ילד או ילדה 2')).toHaveFocus();
    await u.type(cardNameField('ילד או ילדה 2'), 'אורי');
    await u.selectOptions(cardSex('אורי'), 'בן');

    expect(removeButtons().map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(
      expect.arrayContaining(['הסרת הפרטים של נועה', 'הסרת הפרטים של אורי']),
    );
    await u.click(screen.getByRole('button', { name: 'הסרת הפרטים של נועה' }));
    expect(screen.queryByRole('group', { name: 'נועה' })).toBeNull();
    expect(cardNameField('אורי')).toHaveValue('אורי');
    expect(cardSex('אורי')).toHaveDisplayValue('בן');
    expect(addButton()).toHaveFocus();
    expect(removeButtons()).toHaveLength(0);
  });

  it('[VAL-040][AC-090] a remove button of an unnamed card is named by its position', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.click(addButton());
    expect(screen.getByRole('button', { name: 'הסרת הפרטים של ילד או ילדה 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הסרת הפרטים של ילד או ילדה 2' })).toBeInTheDocument();
  });

  it('[VAL-040][AC-090] at 10 cards the add button stays visible, is aria-disabled, adds nothing and is described by the limit note', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    for (let i = 0; i < 9; i += 1) await u.click(addButton());
    expect(allCards()).toHaveLength(10);
    const add = addButton();
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(descriptionOf(add)).toContain('אפשר להוסיף עד 10 ילדים');
    await u.click(add);
    expect(allCards()).toHaveLength(10);
  });

  it('[minors · review 8] the child name input opts out of the browser form history: autocomplete="off", on every card', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.click(addButton());
    for (const n of ['ילד או ילדה 1', 'ילד או ילדה 2']) {
      expect(cardNameField(n), n).toHaveAttribute('autocomplete', 'off');
    }
  });
});

function descriptionOf(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

describe('F1.3 criterion 9 (child cases) [AC-002 · ERR-003 · VAL-005 · VAL-006] child errors', () => {
  it('[ERR-003] an empty child: name, sex and birth date each show their DR-4 message; focus goes to the child\'s name', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(fullName(), 'דנה כהן');
    await u.click(next());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');
    const name = cardNameField('ילד או ילדה 1');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(name)).toContain('יש למלא שם');
    expect(cardSex('ילד או ילדה 1')).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(cardSex('ילד או ילדה 1'))).toContain('יש לבחור מין');
    for (const n of ['יום', 'חודש', 'שנה']) {
      expect(within(cardDate('ילד או ילדה 1')).getByLabelText(n)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(describedText(within(cardDate('ילד או ילדה 1')).getByLabelText('יום'))).toContain('יש למלא תאריך לידה');
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('[VAL-005][ERR-003] a future date, 31.2 and a date before 1900 each show their text; a valid child then proceeds', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(fullName(), 'דנה כהן');
    await u.type(cardNameField('ילד או ילדה 1'), 'נועה');
    await u.selectOptions(cardSex('נועה'), 'בת');

    const text = () => describedText(cardDay('נועה'));
    await setDate(u, 'נועה', '15', '10', '2026'); // tomorrow, today is 2026-10-14
    await u.click(next());
    expect(text()).toContain('תאריך הלידה לא יכול להיות בעתיד');

    await setDate(u, 'נועה', '31', '2', '2024');
    await u.click(next());
    expect(text()).toContain('התאריך אינו תקין. יש לבדוק יום, חודש ושנה');

    // Review 1: before 1900 now names the bound instead of the generic text.
    await setDate(u, 'נועה', '31', '12', '1899');
    await u.click(next());
    expect(text()).toContain('התאריך צריך להיות מ-1900 ואילך');
    expect(text()).not.toContain('משהו השתבש');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');

    await setDate(u, 'נועה', '29', '2', '2024');
    await u.click(next());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
  });

  it('[ERR-003][review 1] a child name of 61 characters shows "שם צריך להכיל עד 60 תווים", not the generic text; 60 is accepted', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(fullName(), 'דנה כהן');
    // fireEvent: the value is set whole, whatever a maxlength attribute would allow a user to type.
    fireEvent.change(cardNameField('ילד או ילדה 1'), { target: { value: 'א'.repeat(61) } });
    await u.click(next());
    const name = cardNameField('א'.repeat(61));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(name)).toContain('שם צריך להכיל עד 60 תווים');
    expect(describedText(name)).not.toContain('משהו השתבש');
    fireEvent.change(name, { target: { value: 'א'.repeat(60) } });
    await waitFor(() => expect(cardNameField('א'.repeat(60))).not.toHaveAttribute('aria-invalid', 'true'));
  });
});

describe('F1.3 criterion 9 (review 6) [ERR-003] errors only for fields present at the last "המשך", or touched since', () => {
  it('[ERR-003][review 6] after a failed "המשך" a new card has no aria-invalid and no alert; typing shows that card\'s errors; the earlier card keeps its own', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(fullName(), 'דנה כהן');
    await u.click(next());
    expect(invalidIn('ילד או ילדה 1').length).toBeGreaterThanOrEqual(3);
    expect(alertsIn('ילד או ילדה 1').length).toBeGreaterThanOrEqual(1);

    await u.click(addButton());
    expect(invalidIn('ילד או ילדה 2'), 'a new card shows no invalid field').toEqual([]);
    expect(alertsIn('ילד או ילדה 2'), 'a new card shows no alert').toEqual([]);
    expect(invalidIn('ילד או ילדה 1').length, 'the earlier card keeps its errors').toBeGreaterThanOrEqual(3);

    await u.type(cardNameField('ילד או ילדה 2'), 'אורי'); // touching the new card
    expect(cardNameField('אורי')).not.toHaveAttribute('aria-invalid', 'true');
    expect(cardSex('אורי')).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(cardSex('אורי'))).toContain('יש לבחור מין');
    expect(alertsIn('אורי').length).toBeGreaterThanOrEqual(1);
    expect(invalidIn('ילד או ילדה 1').length).toBeGreaterThanOrEqual(3);
  });

  it('[ERR-003][review 6] ticking "יש לנו ילד או ילדה" after a failed "המשך" opens a card without errors', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(next()); // fails: no stage, no name
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    await u.click(stage(HAS_CHILD));
    expect(allCards()).toHaveLength(1);
    expect(invalidIn('ילד או ילדה 1')).toEqual([]);
    expect(alertsIn('ילד או ילדה 1')).toEqual([]);
  });

  it('[ERR-003][review 6] a message still clears live: once a field is valid after a failed "המשך", its error is gone', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(fullName(), 'דנה כהן');
    await u.click(next());
    expect(cardNameField('ילד או ילדה 1')).toHaveAttribute('aria-invalid', 'true');
    await u.type(cardNameField('ילד או ילדה 1'), 'נועה');
    expect(cardNameField('נועה')).not.toHaveAttribute('aria-invalid', 'true');
  });
});
