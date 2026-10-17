import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { FriendsScreen } from './FriendsScreen';

// The Friends page's flow (F2.4b) with the server stubbed per story: load, accept, remove after a confirmation, and the failures. The
// drawn states for the baselines are FriendsContent's stories; these play the transitions.
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
  endAfterPasswordChange: () => Promise.resolve(),
};

function Screen() {
  return (
    <SessionAccountContext value={account}>
      <main className="px-4 py-5">
        <FriendsScreen />
      </main>
    </SessionAccountContext>
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const lists = {
  incoming: [{ userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', fullName: 'דנה כהן', requestedAt: '2026-10-15T09:30:00.000Z' }],
  sent: [],
  friends: [{ userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a04', fullName: 'מירי אברהם' }],
};

// Replaces fetch for one story: GET answers the lists, every other call answers `act`. The returned function restores it.
const serving = (get: () => Promise<Response>, act: () => Promise<Response>) => () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => (init?.method === 'GET' ? get() : act());
  return () => {
    globalThis.fetch = original;
  };
};

const okLists = () => Promise.resolve(json(200, lists));
const okAction = () => Promise.resolve(json(200, {}));

const meta = {
  title: 'features/friends/FriendsScreen',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  beforeEach: serving(okLists, okAction),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('heading', { name: 'החברים שלי' });
  },
};

export const LoadFailsThenRetries: Story = {
  beforeEach: serving(() => Promise.resolve(json(503, { error: 'unavailable' })), okAction),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'נסו שוב' }));
    await canvas.findByRole('button', { name: 'נסו שוב' });
  },
};

export const AcceptMovesToFriends: Story = {
  beforeEach: serving(okLists, okAction),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /אישור.*דנה כהן/ }));
    await expect(await canvas.findByText('אין בקשות חברות שממתינות לתשובה')).toBeInTheDocument();
  },
};

export const ActionFails: Story = {
  beforeEach: serving(okLists, () => Promise.resolve(json(500, { error: 'internal' }))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /אישור.*דנה כהן/ }));
    await canvas.findByRole('alert');
    await expect(canvas.getByRole('button', { name: /אישור.*דנה כהן/ })).toBeInTheDocument();
  },
};

export const RemoveAfterConfirmation: Story = {
  beforeEach: serving(okLists, okAction),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /הסרה.*מירי אברהם/ }));
    const dialog = within(await within(document.body).findByRole('alertdialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'הסרה' }));
    await expect(await canvas.findByText('עדיין אין חברים ברשימה')).toBeInTheDocument();
  },
};
