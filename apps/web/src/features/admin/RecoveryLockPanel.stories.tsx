import type { Meta, StoryObj } from '@storybook/react-vite';
import { ACTION_FAILED_TEXT } from './admin-texts';
import { RecoveryLockPanel } from './RecoveryLockPanel';

// The Admin's release of an account's recovery lock (FR-ADMIN-013) in each of its states.
const meta = {
  title: 'features/admin/RecoveryLockPanel',
  component: RecoveryLockPanel,
  args: { pending: false, failure: null, onRelease: () => undefined },
} satisfies Meta<typeof RecoveryLockPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Releasing: Story = { args: { pending: true } };
export const Failed: Story = { args: { failure: ACTION_FAILED_TEXT } };
