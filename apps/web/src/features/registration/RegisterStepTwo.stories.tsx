import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { MemoryRouter } from 'react-router';
import type { RegistrationStep1 } from '@nestly/shared';
import { AuthPortContext } from '@/hooks/use-auth-port';
import type { AuthFailure, AuthPort } from '@/services/auth/auth-client';
import { RegisterStepTwo } from './RegisterStepTwo';

const STEP1: RegistrationStep1 = { stages: ['planning'], fullName: 'נועה רז', parentGender: null, dueDate: null, children: [] };

// A fake Auth client that fails the way the story needs: the screen then shows that state with no network.
function failing(failure: AuthFailure): AuthPort {
  return { signUp: () => Promise.resolve({ accessToken: null, failure }) };
}

function StepTwo({ failure }: { failure: AuthFailure }) {
  const [email, setEmail] = useState('');
  return (
    <AuthPortContext value={failing(failure)}>
      <MemoryRouter>
        <RegisterStepTwo step1={STEP1} email={email} onEmailChange={setEmail} onBack={() => undefined} />
      </MemoryRouter>
    </AuthPortContext>
  );
}

const meta = {
  title: 'features/registration/RegisterStepTwo',
  component: StepTwo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StepTwo>;

export default meta;
type Story = StoryObj<typeof meta>;

const UNKNOWN: AuthFailure = { status: 500, code: undefined, name: 'AuthApiError' };

export const Empty: Story = { args: { failure: UNKNOWN } };

// The errors of a first "יצירת חשבון", pressed by the story itself.
export const WithErrors: Story = {
  args: { failure: UNKNOWN },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByLabelText('סיסמה'), '1234567');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'יצירת חשבון' }));
  },
};

// Valid details, the box ticked, and Auth's answer: the state that follows.
const fillAndSubmit: Story['play'] = async ({ canvasElement }) => {
  const screen = within(canvasElement);
  await userEvent.type(screen.getByLabelText('אימייל'), 'noa@example.com');
  await userEvent.type(screen.getByLabelText('סיסמה'), 'ציפור בקן שלי');
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }));
};

export const EmailTaken: Story = {
  args: { failure: { status: 422, code: 'user_already_exists', name: 'AuthApiError' } },
  play: fillAndSubmit,
};

export const RetryAfterNetworkFailure: Story = {
  args: { failure: { status: 0, code: undefined, name: 'AuthRetryableFetchError' } },
  play: fillAndSubmit,
};
