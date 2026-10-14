// F1.3 pass d (unit): criterion 7 (has-child half), 8 (children cards), 9 (child error cases).
// Derived from .work/register-profile-step/spec.md and the interface given for pass d. No type assertions.
// Runs from inside apps/web: `npx vitest run tests/registration/registration-children.test.tsx`.
import { render, screen, waitFor, within } from '@testing-library/react';
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
const allCards = () => screen.queryAllByRole('group', { name: /^ילד או ילדה \d+$/ });
const removeButtons = () => screen.queryAllByRole('button', { name: /^הסרת הפרטים של/ });
const next = () => screen.getByRole('button', { name: 'המשך' });

function describedText(el: HTMLElement): string {
  const holder = el.getAttribute('aria-describedby') ? el : el.closest('fieldset');
  const ids = (holder?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

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
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
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

  it('[VAL-005][ERR-003] a future date, 31.2 and a date before 1900 each show their text (the last one the generic text); a valid child proceeds', async () => {
    const u = userEvent.setup();
    renderFlow();
    await u.click(stage(HAS_CHILD));
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
    await u.type(cardNameField('ילד או ילדה 1'), 'נועה');
    await u.selectOptions(cardSex('נועה'), 'בת');

    const text = () => describedText(within(cardDate('נועה')).getByLabelText('יום'));
    await setDate(u, 'נועה', '15', '10', '2026'); // tomorrow, today is 2026-10-14
    await u.click(next());
    expect(text()).toContain('תאריך הלידה לא יכול להיות בעתיד');

    await setDate(u, 'נועה', '31', '2', '2024');
    await u.click(next());
    expect(text()).toContain('התאריך אינו תקין. יש לבדוק יום, חודש ושנה');

    await setDate(u, 'נועה', '31', '12', '1899');
    await u.click(next());
    expect(text()).toContain('משהו השתבש. אפשר לנסות שוב');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים');

    await setDate(u, 'נועה', '29', '2', '2024');
    await u.click(next());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטי התחברות');
  });
});
