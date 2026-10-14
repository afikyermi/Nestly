// F1.3 pass d, criterion 12 (two-children hand-off) [FR-REG-002 "פלט" · AC-090]: step 2 is mocked to capture its props.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
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

describe('F1.3 criterion 12 (two children) [FR-REG-002 · AC-090]', () => {
  it('[FR-REG-002][AC-090] pregnant + has-child with two children: the handed value is the parsed output, in order, names trimmed, dates ISO', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegistrationFlow today="2026-10-14" />
      </MemoryRouter>,
    );
    const stages = within(screen.getByRole('group', { name: 'השלב במסע' }));
    await u.click(stages.getByRole('checkbox', { name: /בהריון/ }));
    await u.click(stages.getByRole('checkbox', { name: /יש לנו ילד או ילדה/ }));
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
    const due = within(screen.getByRole('group', { name: /תאריך לידה משוער/ }));
    await u.type(due.getByLabelText('יום'), '1');
    await u.type(due.getByLabelText('חודש'), '12');
    await u.type(due.getByLabelText('שנה'), '2026');

    await u.type(within(screen.getByRole('group', { name: 'ילד או ילדה 1' })).getByLabelText('שם'), '  נועה  ');
    await u.selectOptions(within(screen.getByRole('group', { name: 'נועה' })).getByLabelText('מין'), 'בת');
    const first = within(within(screen.getByRole('group', { name: 'נועה' })).getByRole('group', { name: 'תאריך לידה' }));
    await u.type(first.getByLabelText('יום'), '29');
    await u.type(first.getByLabelText('חודש'), '2');
    await u.type(first.getByLabelText('שנה'), '2024');

    await u.click(screen.getByRole('button', { name: 'הוספת ילד נוסף' }));
    await u.type(within(screen.getByRole('group', { name: 'ילד או ילדה 2' })).getByLabelText('שם'), 'אורי');
    await u.selectOptions(within(screen.getByRole('group', { name: 'אורי' })).getByLabelText('מין'), 'עוד לא ידוע');
    const second = within(within(screen.getByRole('group', { name: 'אורי' })).getByRole('group', { name: 'תאריך לידה' }));
    await u.type(second.getByLabelText('יום'), '05');
    await u.type(second.getByLabelText('חודש'), '03');
    await u.type(second.getByLabelText('שנה'), '2026');

    await u.click(screen.getByRole('button', { name: 'המשך' }));
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
    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegistrationFlow today="2026-10-14" />
      </MemoryRouter>,
    );
    const stages = within(screen.getByRole('group', { name: 'השלב במסע' }));
    await u.click(stages.getByRole('checkbox', { name: /יש לנו ילד או ילדה/ }));
    await u.type(within(screen.getByRole('group', { name: 'ילד או ילדה 1' })).getByLabelText('שם'), 'נועה');
    await u.click(stages.getByRole('checkbox', { name: /יש לנו ילד או ילדה/ })); // untick
    await u.click(stages.getByRole('checkbox', { name: /מתכננים/ }));
    await u.type(screen.getByLabelText(/^שם מלא/), 'דנה כהן');
    await u.click(screen.getByRole('button', { name: 'המשך' }));
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
