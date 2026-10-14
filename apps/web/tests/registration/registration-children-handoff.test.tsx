// F1.3 pass d, criterion 12 (two-children hand-off) [FR-REG-002 "פלט" · AC-090]: step 2 is mocked to capture its props.
// Also the review follow-up (findings.md 2): after Back, an edit of step 1 must not leave a stale value for Forward.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router';
import { RegistrationFlow } from '@/features/registration/RegistrationFlow';

const captured = vi.hoisted((): { calls: unknown[] } => ({ calls: [] }));
vi.mock('@/features/registration/RegisterStepTwo', () => {
  const RegisterStepTwo = (props: unknown) => {
    captured.calls.push(props);
    return <h1>פרטי התחברות</h1>;
  };
  return { RegisterStepTwo, default: RegisterStepTwo };
});

function lastStep1(): unknown {
  const last = captured.calls.at(-1);
  if (typeof last !== 'object' || last === null || !('step1' in last)) throw new Error('step 2 was not rendered with step1');
  return last.step1;
}

function History() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => void navigate(-1)}>
        probe-back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        probe-forward
      </button>
    </div>
  );
}

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegistrationFlow today="2026-10-14" />
      <History />
    </MemoryRouter>,
  );
}

const stages = () => within(screen.getByRole('group', { name: 'השלב במסע' }));
const next = () => screen.getByRole('button', { name: 'המשך' });
type User = ReturnType<typeof userEvent.setup>;
const card = (name: string) => screen.getByRole('group', { name });

async function fillChild(u: User, cardName: string, typedName: string, sex: string, d: string, m: string, y: string) {
  await u.type(within(card(cardName)).getByLabelText('שם'), typedName);
  await u.selectOptions(within(card(typedName)).getByLabelText('מין'), sex);
  const date = within(within(card(typedName)).getByRole('group', { name: 'תאריך לידה' }));
  await u.type(date.getByLabelText('יום'), d);
  await u.type(date.getByLabelText('חודש'), m);
  await u.type(date.getByLabelText('שנה'), y);
}

async function reachStep2WithTwoChildren(u: User) {
  await u.click(stages().getByRole('checkbox', { name: /יש לנו ילד או ילדה/ }));
  await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
  await fillChild(u, 'ילד או ילדה 1', 'נועה', 'בת', '29', '2', '2024');
  await u.click(screen.getByRole('button', { name: 'הוספת ילד נוסף' }));
  await fillChild(u, 'ילד או ילדה 2', 'אורי', 'בן', '5', '3', '2026');
  await u.click(next());
  await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
}

describe('F1.3 criterion 12 (two children) [FR-REG-002 · AC-090]', () => {
  it('[FR-REG-002][AC-090] pregnant + has-child with two children: the handed value is the parsed output, in order, names trimmed, dates ISO', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    renderFlow();
    await u.click(stages().getByRole('checkbox', { name: /בהריון/ }));
    await u.click(stages().getByRole('checkbox', { name: /יש לנו ילד או ילדה/ }));
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
    const due = within(screen.getByRole('group', { name: /תאריך לידה משוער/ }));
    await u.type(due.getByLabelText('יום'), '1');
    await u.type(due.getByLabelText('חודש'), '12');
    await u.type(due.getByLabelText('שנה'), '2026');

    await u.type(within(card('ילד או ילדה 1')).getByLabelText('שם'), '  נועה  ');
    await u.selectOptions(within(card('נועה')).getByLabelText('מין'), 'בת');
    const first = within(within(card('נועה')).getByRole('group', { name: 'תאריך לידה' }));
    await u.type(first.getByLabelText('יום'), '29');
    await u.type(first.getByLabelText('חודש'), '2');
    await u.type(first.getByLabelText('שנה'), '2024');

    await u.click(screen.getByRole('button', { name: 'הוספת ילד נוסף' }));
    await u.type(within(card('ילד או ילדה 2')).getByLabelText('שם'), 'אורי');
    await u.selectOptions(within(card('אורי')).getByLabelText('מין'), 'עוד לא ידוע');
    const second = within(within(card('אורי')).getByRole('group', { name: 'תאריך לידה' }));
    await u.type(second.getByLabelText('יום'), '05');
    await u.type(second.getByLabelText('חודש'), '03');
    await u.type(second.getByLabelText('שנה'), '2026');

    await u.click(next());
    await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
    expect(lastStep1()).toEqual({
      stages: ['pregnant', 'has_child'],
      fullName: 'דנה כהן',
      parentGender: null,
      dueDate: '2026-12-01',
      children: [
        { name: 'נועה', sex: 'girl', birthDate: '2024-02-29' },
        { name: 'אורי', sex: 'unknown', birthDate: '2026-03-05' },
      ],
    });
  });

  it('[FR-REG-002][Q3] children typed and then unticked never reach step 2', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    renderFlow();
    await u.click(stages().getByRole('checkbox', { name: /יש לנו ילד או ילדה/ }));
    await u.type(within(card('ילד או ילדה 1')).getByLabelText('שם'), 'נועה');
    await u.click(stages().getByRole('checkbox', { name: /יש לנו ילד או ילדה/ })); // untick
    await u.click(stages().getByRole('checkbox', { name: /מתכננים/ }));
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
    await u.click(next());
    await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
    expect(lastStep1()).toEqual({
      stages: ['planning'],
      fullName: 'דנה כהן',
      parentGender: null,
      dueDate: null,
      children: [],
    });
  });
});

describe('F1.3 criterion 12 / Q3 (review 2) [FR-REG-002] Back, edit, Forward: no stale value reaches step 2', () => {
  it('[FR-REG-002][Q3][review 2] valid, Back, untick "יש לנו ילד או ילדה", Forward: step 1 is shown, not step 2', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    renderFlow();
    await reachStep2WithTwoChildren(u);
    await u.click(screen.getByRole('button', { name: 'probe-back' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטים אישיים' });

    await u.click(stages().getByRole('checkbox', { name: /יש לנו ילד או ילדה/ })); // untick: the form changed
    const callsBefore = captured.calls.length;
    await u.click(screen.getByRole('button', { name: 'probe-forward' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים'));
    expect(screen.queryByRole('heading', { level: 1, name: 'פרטי התחברות' })).toBeNull();
    expect(captured.calls.length, 'step 2 was not rendered again with the old value').toBe(callsBefore);
  });

  it('[FR-REG-002][Q3][review 2] valid, Back, remove a child card, Forward: step 1 is shown, and the removed child is never handed on', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    renderFlow();
    await reachStep2WithTwoChildren(u);
    await u.click(screen.getByRole('button', { name: 'probe-back' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטים אישיים' });

    await u.click(screen.getByRole('button', { name: 'הסרת הפרטים של אורי' }));
    await u.click(screen.getByRole('button', { name: 'probe-forward' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('פרטים אישיים'));
    expect(screen.queryByRole('heading', { level: 1, name: 'פרטי התחברות' })).toBeNull();

    // Submitting the edited form hands on exactly one child.
    await u.click(next());
    await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
    expect(lastStep1()).toEqual({
      stages: ['has_child'],
      fullName: 'דנה כהן',
      parentGender: null,
      dueDate: null,
      children: [{ name: 'נועה', sex: 'girl', birthDate: '2024-02-29' }],
    });
  });

  it('[FR-REG-002][review 2] without an edit, Back then Forward shows step 2 again with the same value', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    renderFlow();
    await reachStep2WithTwoChildren(u);
    const first = structuredClone(lastStep1());
    await u.click(screen.getByRole('button', { name: 'probe-back' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטים אישיים' });
    await u.click(screen.getByRole('button', { name: 'probe-forward' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
    expect(lastStep1()).toEqual(first);
  });
});
