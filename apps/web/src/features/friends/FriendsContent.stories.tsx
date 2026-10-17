import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FriendLists } from '@nestly/shared';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { FriendsContent } from './FriendsContent';
import { ACTION_FAILED_TEXT, GONE_TEXT, LOAD_FAILED_TEXT } from './friends-texts';

// The Friends page body (F2.4b) in each of its states, drawn from props alone, as it sits in the shell's `main` under the page's
// heading: no server, no timing, so the visual baselines and axe see exactly one state each (e2e/visual-screens.ts).
function Screen(props: Parameters<typeof FriendsContent>[0]) {
  return (
    <main className="px-4 py-5">
      <h1 className="text-h2">חברים</h1>
      <div className="mt-5">
        <FriendsContent {...props} />
      </div>
    </main>
  );
}

const meta = {
  title: 'features/friends/FriendsContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const AT = '2026-10-15T09:30:00.000Z';
const lists: FriendLists = {
  incoming: [
    { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', fullName: 'דנה כהן', requestedAt: AT },
    { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a02', fullName: 'יוסי לוי', requestedAt: AT },
  ],
  sent: [{ userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a03', fullName: 'נעם ברק', requestedAt: AT }],
  friends: [
    { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a04', fullName: 'מירי אברהם' },
    { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a05', fullName: 'Avi Mizrahi' },
  ],
};
const none: FriendLists = { incoming: [], sent: [], friends: [] };
const loaded = { kind: 'loaded', busy: null, failure: null, status: '', confirm: null } as const;

/** c13: a request received, one sent, and Friends (one with a Latin name). */
export const Lists: Story = { args: { view: { ...loaded, lists } } };

/** c13 (Q1): the three lists, each with its own empty text. */
export const Empty: Story = { args: { view: { ...loaded, lists: none } } };

/** c13: "הסרה" opened the dialog naming the Friend. */
export const RemoveDialog: Story = {
  args: { view: { ...loaded, lists, confirm: { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a04', fullName: 'מירי אברהם', saving: false, failure: null } } },
};

export const RemoveDialogSaving: Story = {
  args: { view: { ...loaded, lists, confirm: { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a04', fullName: 'מירי אברהם', saving: true, failure: null } } },
};

/** c14: the removal failed; the Friend stays and the dialog says so. */
export const RemoveDialogFailed: Story = {
  args: {
    view: {
      ...loaded,
      lists,
      confirm: { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a04', fullName: 'מירי אברהם', saving: false, failure: ACTION_FAILED_TEXT },
    },
  },
};

/** c14: an accept is in flight; the other actions wait. */
export const AcceptInFlight: Story = {
  args: { view: { ...loaded, lists, busy: { action: 'accept', userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01' } } },
};

/** c14: the action failed; the entry stays. */
export const ActionFailed: Story = { args: { view: { ...loaded, lists, failure: ACTION_FAILED_TEXT } } };

/** c14: 409 request_gone; the lists were reloaded. */
export const RequestGone: Story = { args: { view: { ...loaded, lists: { ...lists, incoming: lists.incoming.slice(1) }, failure: GONE_TEXT } } };

/** c14: loading shows no lists. */
export const Loading: Story = { args: { view: { kind: 'loading' } } };

/** c14: GET failed. */
export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };

export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };
