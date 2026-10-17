import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MemoryRouter } from 'react-router';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { UserProfileScreen } from './UserProfileScreen';

// Another person's profile flow (F2.4c2) with the server stubbed per story: open, the relationship actions and the failures. The drawn
// states for the baselines are UserProfileContent's stories; these play the transitions.
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
const PERSON = '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01';

function Screen() {
  return (
    <SessionAccountContext value={account}>
      <MemoryRouter>
        <main className="px-4 py-5">
          <UserProfileScreen userId={PERSON} />
        </main>
      </MemoryRouter>
    </SessionAccountContext>
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const profile = (relationship: 'none' | 'sent' | 'received' | 'friends') => ({
  fullName: 'דנה כהן',
  gender: 'woman',
  childrenCount: 1,
  childAges: [{ years: 2, months: 0 }],
  isPregnant: false,
  showsEmptyJourneySentence: false,
  relationship,
  friends: [{ userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a02', fullName: 'מירי אברהם' }],
  mutualFriends: [],
});

// Replaces fetch for one story: GET answers the profiles in turn (the last repeats), every other call answers `act`.
const serving = (gets: Array<() => Response>, act: () => Response) => () => {
  const original = globalThis.fetch;
  let opens = 0;
  globalThis.fetch = (_input, init) => {
    if (init?.method === 'GET') {
      const make = gets[Math.min(opens, gets.length - 1)];
      opens += 1;
      return Promise.resolve(make === undefined ? json(500, {}) : make());
    }
    return Promise.resolve(act());
  };
  return () => {
    globalThis.fetch = original;
  };
};

const meta = {
  title: 'features/user-profile/UserProfileScreen',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SendRequest: Story = {
  beforeEach: serving([() => json(200, profile('none'))], () => json(201, {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /שליחת בקשת חברות.*דנה כהן/ }));
    await expect(await canvas.findByRole('button', { name: /ביטול הבקשה/ })).toBeInTheDocument();
  },
};

export const AcceptOpensAgain: Story = {
  beforeEach: serving([() => json(200, profile('received')), () => json(200, profile('friends'))], () => json(200, {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /אישור.*דנה כהן/ }));
    await expect(await canvas.findByRole('button', { name: /הסרה מהחברים/ })).toBeInTheDocument();
  },
};

export const RemoveAfterConfirmation: Story = {
  beforeEach: serving([() => json(200, profile('friends')), () => json(200, profile('none'))], () => json(200, {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /הסרה מהחברים/ }));
    const dialog = within(await within(document.body).findByRole('alertdialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'הסרה' }));
    await expect(await canvas.findByRole('button', { name: /שליחת בקשת חברות/ })).toBeInTheDocument();
  },
};

export const SendConflictOpensAgain: Story = {
  beforeEach: serving([() => json(200, profile('none')), () => json(200, profile('sent'))], () => json(409, { error: 'request_exists' })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /שליחת בקשת חברות/ }));
    await expect(await canvas.findByText('הבקשה כבר לא זמינה')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /ביטול הבקשה/ })).toBeInTheDocument();
  },
};

export const ActionFails: Story = {
  beforeEach: serving([() => json(200, profile('none'))], () => json(500, { error: 'internal' })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /שליחת בקשת חברות/ }));
    await canvas.findByRole('alert');
    await expect(canvas.getByRole('button', { name: /שליחת בקשת חברות/ })).toBeInTheDocument();
  },
};

export const Unavailable: Story = {
  beforeEach: serving([() => json(404, { error: 'unavailable' })], () => json(200, {})),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('heading', { name: 'הפרופיל לא זמין' });
  },
};

export const RateLimited: Story = {
  beforeEach: serving([() => json(429, { error: 'rate_limited' })], () => json(200, {})),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('alert');
  },
};

export const LoadFailsThenRetries: Story = {
  beforeEach: serving([() => json(503, { error: 'unavailable' }), () => json(200, profile('none'))], () => json(200, {})),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'נסו שוב' }));
    await canvas.findByRole('heading', { name: 'דנה כהן' });
  },
};
