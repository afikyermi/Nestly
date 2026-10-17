import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { ProfileScreen } from './ProfileScreen';

// The profile screen's flow (F2.1) with the server stubbed per story: load, view, edit, save, and the failures. The drawn states for
// the baselines are ProfileContent's stories; these play the transitions.
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
        <ProfileScreen />
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

const dana = () => Promise.resolve(json(200, { fullName: 'דנה כהן', parentGender: 'woman' }));
const echo = (body: unknown) => Promise.resolve(json(200, body));

const meta = {
  title: 'features/profile/ProfileScreen',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  beforeEach: serving(dana, echo),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: 'עריכה' });
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

export const EditAndSave: Story = {
  beforeEach: serving(dana, echo),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'עריכה' }));
    const name = canvas.getByLabelText('שם מלא');
    await userEvent.clear(name);
    await userEvent.type(name, '  רון לוי  ');
    await userEvent.selectOptions(canvas.getByLabelText(/מין ההורה/), 'man');
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('הפרטים נשמרו')).toBeInTheDocument();
  },
};

export const SaveWithErrors: Story = {
  beforeEach: serving(dana, echo),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'עריכה' }));
    await userEvent.clear(canvas.getByLabelText('שם מלא'));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
  },
};

export const SaveFails: Story = {
  beforeEach: serving(dana, () => Promise.resolve(json(500, { error: 'internal' }))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'עריכה' }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await canvas.findByRole('alert');
  },
};
