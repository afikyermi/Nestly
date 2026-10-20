import type { Meta, StoryObj } from '@storybook/react-vite';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { BLOCKED_LOAD_FAILED_TEXT, UNBLOCK_FAILED_TEXT, UNBLOCKED_STATUS } from '@/lib/block-texts';
import { BlockedUsersContent } from './BlockedUsersContent';

// The blocked list in Settings (FR-REL-002) in each of its states, drawn from props alone.
function Screen(props: Parameters<typeof BlockedUsersContent>[0]) {
  return (
    <main className="px-4 py-5">
      <BlockedUsersContent {...props} />
    </main>
  );
}

const meta = {
  title: 'features/blocks/BlockedUsersContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const blocked = [
  { userId: 'b0000000-0000-4000-8000-000000000001', fullName: 'דנה כהן', blockedAt: '2026-10-20T09:00:00.000Z' },
  { userId: 'b0000000-0000-4000-8000-000000000002', fullName: null, blockedAt: '2026-10-19T09:00:00.000Z' },
];

export const List: Story = { args: { view: { kind: 'list', blocked, busy: null, failure: null, status: '' } } };
export const Empty: Story = { args: { view: { kind: 'list', blocked: [], busy: null, failure: null, status: '' } } };
export const Unblocking: Story = { args: { view: { kind: 'list', blocked, busy: blocked[0]?.userId ?? null, failure: null, status: '' } } };
export const Unblocked: Story = { args: { view: { kind: 'list', blocked: blocked.slice(1), busy: null, failure: null, status: UNBLOCKED_STATUS } } };
export const UnblockFailed: Story = { args: { view: { kind: 'list', blocked, busy: null, failure: UNBLOCK_FAILED_TEXT, status: '' } } };
export const Loading: Story = { args: { view: { kind: 'loading' } } };
export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: BLOCKED_LOAD_FAILED_TEXT } } };
export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };
