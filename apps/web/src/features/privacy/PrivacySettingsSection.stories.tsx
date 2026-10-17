import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { PrivacySettingsSection } from './PrivacySettingsSection';

// The privacy settings' flow (F2.3a) with the server stubbed per story: load, change, save, and the failures. The drawn states for
// the baselines are PrivacyContent's stories; these play the transitions.
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
        <PrivacySettingsSection />
      </main>
    </SessionAccountContext>
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Replaces fetch for one story: GET answers `get`, PUT answers `put` (echoing the body on 200). The returned function restores it.
const serving = (get: () => Promise<Response>, put: (body: unknown) => Promise<Response>) => () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    if (init?.method === 'PUT') return put(typeof init.body === 'string' ? JSON.parse(init.body) : null);
    return get();
  };
  return () => {
    globalThis.fetch = original;
  };
};

const defaults = () =>
  Promise.resolve(json(200, { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true }));
const echo = (body: unknown) => Promise.resolve(json(200, body));

const meta = {
  title: 'features/privacy/PrivacySettingsSection',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  beforeEach: serving(defaults, echo),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('radiogroup');
  },
};

export const LoadFailsThenRetries: Story = {
  beforeEach: serving(() => Promise.resolve(json(503, { error: 'unavailable' })), echo),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'נסו שוב' }));
    await canvas.findByRole('button', { name: 'נסו שוב' });
  },
};

export const ChangeAndSave: Story = {
  beforeEach: serving(defaults, echo),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('radio', { name: /פרופיל מוגבל/ }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'הצגת המשפט כשאין ילדים והריון' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'יום הולדת של ילד בהתראות לחברים' }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('הפרטים נשמרו')).toBeInTheDocument();
  },
};

export const SaveFails: Story = {
  beforeEach: serving(defaults, () => Promise.resolve(json(500, { error: 'internal' }))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('radio', { name: /פרופיל מוגבל/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await canvas.findByRole('alert');
  },
};
