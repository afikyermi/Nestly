import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { MAX_CHILDREN } from '@nestly/shared';
import { RegisterStepOne } from './RegisterStepOne';
import { EMPTY_CHILD, EMPTY_STEP1_FORM, type Step1Form } from './step1-form';

// Step 1 of registration with its own state, as the flow holds it. "Today" is fixed so the errors do not drift.
function StepOne({ initial, showErrors }: { initial: Step1Form; showErrors?: boolean }) {
  const [form, setForm] = useState(initial);
  return (
    <MemoryRouter>
      <RegisterStepOne
        form={form}
        onFormChange={setForm}
        getToday={() => '2026-10-14'}
        onValid={() => undefined}
        {...(showErrors === true ? { showErrors } : {})}
      />
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/registration/RegisterStepOne',
  component: StepOne,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StepOne>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { initial: EMPTY_STEP1_FORM } };

// Pregnant and has-child ticked, two children, and the errors of a first "המשך" with nothing filled.
export const BothSectionsWithErrors: Story = {
  args: {
    showErrors: true,
    initial: {
      ...EMPTY_STEP1_FORM,
      stages: ['pregnant', 'has_child'],
      dueDate: { day: '31', month: '2', year: '2027' },
      children: [EMPTY_CHILD, { name: 'נועה', sex: '', birthDate: { day: '1', month: '1', year: '2030' } }],
    },
  },
};

export const TenChildren: Story = {
  args: {
    showErrors: true,
    initial: {
      ...EMPTY_STEP1_FORM,
      stages: ['has_child'],
      children: Array.from({ length: MAX_CHILDREN }, () => EMPTY_CHILD),
    },
  },
};
