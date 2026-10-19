import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LikeButton } from './like-button';

// Toggles like the screens do: the count moves at once.
function Demo(args: React.ComponentProps<typeof LikeButton>) {
  const [liked, setLiked] = useState(false);
  return <LikeButton {...args} liked={liked} count={liked ? 4 : 3} onToggle={() => setLiked(!liked)} />;
}

const meta = {
  title: 'shared/LikeButton',
  component: LikeButton,
  args: { label: 'לייק', count: 0, liked: false, onToggle: () => undefined },
} satisfies Meta<typeof LikeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoLikes: Story = {};
export const WithCount: Story = { args: { count: 12 } };
export const Liked: Story = { args: { count: 13, liked: true } };

export const Interactive: Story = { render: (args) => <Demo {...args} /> };
