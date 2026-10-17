import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SessionAccountContext } from '@/hooks/use-session-account';
import type { SessionAccount } from '@/services/session/session-source';
import { JourneysSection } from './JourneysSection';

// The "המסע שלי" flow (F2.2a, F2.2b1) with the server stubbed per story: load, view, add, edit, and the failures. The drawn states for the
// baselines are JourneysContent's stories; these play the transitions.
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
        <JourneysSection />
      </main>
    </SessionAccountContext>
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const noa = { id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', name: 'נועה', sex: 'girl', birthDate: '2023-05-04' };
const pregnant = { id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c01', stage: 'pregnant', dueDate: '2027-03-01' };
const hasChild = { id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c02', stage: 'has_child', dueDate: null };
const stored = () => Promise.resolve(json(200, { journeys: [pregnant, hasChild], children: [noa] }));

// Replaces fetch for one story: GET answers `get`, POST and PUT answer `write`. The returned function restores it.
const serving = (get: () => Promise<Response>, write: () => Promise<Response>) => () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => (init?.method === 'POST' || init?.method === 'PUT' ? write() : get());
  return () => {
    globalThis.fetch = original;
  };
};

const meta = {
  title: 'features/journeys/JourneysSection',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  beforeEach: serving(stored, stored),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: 'עריכה', description: /נועה/ });
  },
};

export const LoadFailsThenRetries: Story = {
  beforeEach: serving(() => Promise.resolve(json(503, { error: 'unavailable' })), stored),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'נסו שוב' }));
    await canvas.findByRole('button', { name: 'נסו שוב' });
  },
};

export const AddChild: Story = {
  beforeEach: serving(stored, () =>
    Promise.resolve(
      json(201, {
        journeys: [pregnant, hasChild],
        children: [noa, { id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a02', name: 'איתי', sex: 'boy', birthDate: '2025-01-10' }],
      }),
    ),
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'הוספת ילד' }));
    await userEvent.type(canvas.getByLabelText('שם'), 'איתי');
    await userEvent.selectOptions(canvas.getByLabelText('מין'), 'boy');
    await userEvent.type(canvas.getByLabelText('יום'), '10');
    await userEvent.type(canvas.getByLabelText('חודש'), '1');
    await userEvent.type(canvas.getByLabelText('שנה'), '2025');
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('הפרטים נשמרו')).toBeInTheDocument();
  },
};

export const SaveWithErrors: Story = {
  beforeEach: serving(stored, stored),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'הוספת ילד' }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('יש למלא שם')).toBeInTheDocument();
  },
};

export const EditFails: Story = {
  beforeEach: serving(stored, () => Promise.resolve(json(500, { error: 'internal' }))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'עריכה', description: /נועה/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await canvas.findByText('השמירה לא הצליחה. אפשר לנסות שוב');
  },
};

// F2.2b1 c14: the pregnancy's "עריכה" opens its due date; clearing all three parts saves no due date.
export const EditDueDate: Story = {
  beforeEach: serving(stored, () => Promise.resolve(json(200, { journeys: [{ ...pregnant, dueDate: null }, hasChild], children: [noa] }))),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'עריכה', description: /בהריון/ }));
    for (const label of ['יום', 'חודש', 'שנה']) await userEvent.clear(canvas.getByLabelText(label));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('הפרטים נשמרו')).toBeInTheDocument();
    await canvas.findByText('בהריון · תאריך לידה משוער: לא צוין');
  },
};

// c15: with has_child only, "הוספת הריון" opens an empty due date; a save shows the pregnancy before has_child.
export const AddPregnancy: Story = {
  beforeEach: serving(
    () => Promise.resolve(json(200, { journeys: [hasChild], children: [noa] })),
    () => Promise.resolve(json(201, { journeys: [{ ...pregnant, dueDate: null }, hasChild], children: [noa] })),
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'הוספת הריון' }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    await expect(await canvas.findByText('הפרטים נשמרו')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'הוספת הריון' })).not.toBeInTheDocument();
  },
};

// c15 (CRITIC low): another tab added the pregnancy first. POST answers 409 stage_conflict; the form closes, the view is read
// again and shows the stored pregnancy, with no error, and focus lands on its "עריכה".
let conflictGets = 0;
export const AddPregnancyConflict: Story = {
  beforeEach: () => {
    conflictGets = 0;
    return serving(
      () => {
        conflictGets += 1;
        return Promise.resolve(json(200, { journeys: conflictGets === 1 ? [hasChild] : [pregnant, hasChild], children: [noa] }));
      },
      () => Promise.resolve(json(409, { error: 'stage_conflict' })),
    )();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'הוספת הריון' }));
    await userEvent.click(canvas.getByRole('button', { name: 'שמירה' }));
    const edit = await canvas.findByRole('button', { name: 'עריכה', description: /בהריון/ });
    await expect(edit).toHaveFocus();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'הוספת הריון' })).not.toBeInTheDocument();
  },
};
