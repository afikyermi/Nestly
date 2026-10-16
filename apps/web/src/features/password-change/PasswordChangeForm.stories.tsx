import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { PasswordChangeForm } from './PasswordChangeForm';

// The password-change screen (F2.0 c15) on its own, as it sits in the shell's `main`. The server answer is stubbed per story, so each
// state of the screen is drawn: empty, field errors, success, and the three server failures (ERR-042, ERR-043, ERR-044).
const unused = () => Promise.reject(new Error('Not used by this story.'));
const account: SessionAccount = {
  signInWithPassword: unused,
  signInWithGoogle: unused,
  discardGoogleStart: () => undefined,
  googleAccount: unused,
  recheck: () => Promise.resolve(),
  getAccessToken: () => Promise.resolve('story-token'),
  clearNotice: () => undefined,
  markRecoveryQuestionsSet: () => undefined,
  markPasswordSet: () => undefined,
};

function Screen() {
  return (
    <SessionAccountContext value={account}>
      <main className="px-4 py-5">
        <PasswordChangeForm />
      </main>
    </SessionAccountContext>
  );
}

// Replaces fetch for one story with a fixed answer; the returned function restores it.
const answering = (status: number, body: unknown) => () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  return () => {
    globalThis.fetch = original;
  };
};

const fillAndSubmit: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const answers = canvas.getAllByRole('textbox');
  const [first, second] = answers;
  if (first === undefined || second === undefined) throw new Error('The answer fields are missing.');
  await userEvent.type(first, 'מיצי');
  await userEvent.type(second, 'שוקי');
  await userEvent.type(canvas.getByLabelText('סיסמה חדשה'), 'a-long-enough-password');
  await userEvent.click(canvas.getByRole('button', { name: 'החלפת הסיסמה' }));
  await canvas.findByText(/הסיסמה הוחלפה|אפשר לנסות שוב/);
};

const meta = {
  title: 'features/password-change/PasswordChangeForm',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

// A submit with nothing filled: the answer-count error on the group and the VAL-003 error on the password.
export const FieldErrors: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'החלפת הסיסמה' }));
  },
};

export const Changed: Story = { beforeEach: answering(200, { ok: true }), play: fillAndSubmit };

export const Mismatch: Story = { beforeEach: answering(401, { error: 'invalid_recovery' }), play: fillAndSubmit };

export const Locked: Story = { beforeEach: answering(429, { error: 'rate_limited' }), play: fillAndSubmit };

export const Unavailable: Story = { beforeEach: answering(503, { error: 'unavailable' }), play: fillAndSubmit };
