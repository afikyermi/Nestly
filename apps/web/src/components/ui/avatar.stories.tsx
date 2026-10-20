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

export const Small: Story = { args: { name: 'נועה רז', size: 'sm' } };

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#bcd4e6"/><circle cx="48" cy="40" r="20" fill="#f4c9a8"/></svg>');

// I5: a profile photo the viewer may see replaces the initials; the name stays its accessible name.
export const Photo: Story = { args: { name: 'נועה רז', src: PHOTO } };

// I5: the profile page's large size.
export const LargePhoto: Story = { args: { name: 'נועה רז', src: PHOTO, size: 'lg' } };
