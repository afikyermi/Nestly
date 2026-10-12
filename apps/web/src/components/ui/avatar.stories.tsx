import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './avatar';

const meta = {
  title: 'ui/Avatar',
  component: Avatar,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Two words: the first letter of each.
export const Initials: Story = { args: { name: 'נועה רז' } };

export const SingleWord: Story = { args: { name: 'נועה' } };

// No name: the generic person icon, named by `label`.
export const Anonymous: Story = { args: { label: 'פרופיל' } };

// The name is shown beside the avatar, so the avatar itself is decorative.
export const BesideName: Story = {
  args: { name: 'נועה רז', decorative: true },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} />
      <span className="text-body">נועה רז</span>
    </div>
  ),
};

export const Small: Story = { args: { name: 'נועה רז', className: 'size-6 text-caption' } };
