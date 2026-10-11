import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton';

const meta = {
  title: 'ui/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = { args: { className: 'h-4 w-64' } };

// A card-shaped placeholder: avatar and two lines.
export const CardShape: Story = {
  render: () => (
    <div className="flex w-80 items-center gap-3 rounded-lg bg-card p-card-padding shadow-card">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  ),
};
