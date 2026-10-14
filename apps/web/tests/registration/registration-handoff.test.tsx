// F1.3 pass c, criterion 12 (hand-off half) [FR-REG-002 "פלט"]: the value handed to step 2 deep-equals the schema's
// parsed output and holds nothing from an unticked choice. Step 2 is mocked to capture its props.
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

const stage = (name: string) =>
  within(screen.getByRole('group', { name: 'השלב במסע' })).getByRole('checkbox', { name: new RegExp(name) });
const due = (n: string) => within(screen.getByRole('group', { name: /תאריך לידה משוער/ })).getByLabelText(n);

function lastStep1(): unknown {
  const last = captured.calls.at(-1);
  if (typeof last !== 'object' || last === null || !('step1' in last)) throw new Error('step 2 was not rendered with step1');
  return last.step1;
}

describe('F1.3 criterion 12 (hand-off) [FR-REG-002]', () => {
  it('[FR-REG-002] the handed value equals the parsed output: trimmed name, gender, ISO due date, no children', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegistrationFlow today="2026-10-14" />
      </MemoryRouter>,
    );
    await u.click(stage('בהריון'));
    await u.type(screen.getByLabelText(/^שם מלא/), '  דנה כהן  ');
    await u.selectOptions(screen.getByLabelText(/^מין ההורה/), 'woman');
    await u.type(due('יום'), '1');
    await u.type(due('חודש'), '12');
    await u.type(due('שנה'), '2026');
    await u.click(screen.getByRole('button', { name: 'המשך' }));
    await screen.findByRole('heading', { level: 1, name: 'פרטי התחברות' });
    expect(lastStep1()).toEqual({
      stages: ['pregnant'],
      fullName: 'דנה כהן',
      parentGender: 'woman',
      dueDate: '2026-12-01',
      children: [],
    });
  });

  it('[FR-REG-002][Q3] values of an unticked choice never reach step 2: a due date typed then swapped for "planning" arrives as null', async () => {
    captured.calls.length = 0;
    const u = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register']}>
        <RegistrationFlow today="2026-10-14" />
      </MemoryRouter>,
    );
    await u.click(stage('בהריון'));
    await u.type(due('יום'), '1');
    await u.type(due('חודש'), '12');
    await u.type(due('שנה'), '2026');
    await u.click(stage('מתכננים')); // auto-unticks "בהריון"
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
