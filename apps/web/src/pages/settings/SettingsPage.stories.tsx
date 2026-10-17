import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { SettingsPage } from './SettingsPage';

// The Settings page at the top and at each section's address, with the privacy API stubbed per story like the Privacy section's own
// stories (F2.3): loaded by default, so the page is drawn as designed. Account and Terms & Privacy hold only links (F2.5 c9).
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

function At({ entry }: { entry: string }) {
  return (
    <SessionAccountContext value={account}>
      <MemoryRouter initialEntries={[entry]}>
        <main className="px-4 py-5">
          <SettingsPage />
        </main>
      </MemoryRouter>
    </SessionAccountContext>
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Replaces fetch for one story. The returned function restores it.
const serving = (answer: () => Promise<Response>) => () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => answer();
  return () => {
    globalThis.fetch = original;
  };
};

const loaded = serving(() =>
  Promise.resolve(json(200, { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true })),
);
const waitForForm = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await within(canvasElement).findByRole('radiogroup');
};

const meta = {
  title: 'pages/SettingsPage',
  component: SettingsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// The designed state (the visual baseline): Account, Privacy & Security with the form loaded, Terms & Privacy.
export const Top: Story = { render: () => <At entry="/settings" />, beforeEach: loaded, play: waitForForm };

export const AccountSection: Story = { render: () => <At entry="/settings#account" />, beforeEach: loaded, play: waitForForm };

export const PrivacySection: Story = { render: () => <At entry="/settings#privacy" />, beforeEach: loaded, play: waitForForm };

export const TermsSection: Story = { render: () => <At entry="/settings#terms" />, beforeEach: loaded, play: waitForForm };

// An unknown section shows the top, no error.
export const UnknownSection: Story = { render: () => <At entry="/settings#nope" />, beforeEach: loaded, play: waitForForm };

// c9: the privacy load fails; only that section changes, the others stay usable.
export const PrivacyLoadFailed: Story = {
  render: () => <At entry="/settings" />,
  beforeEach: serving(() => Promise.resolve(json(503, { error: 'unavailable' }))),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: 'נסו שוב' });
  },
};
