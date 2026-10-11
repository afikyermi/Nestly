import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent } from 'storybook/test';
import { Button } from './button';
import { MenuIcon } from './icons';
import { Tooltip } from './tooltip';

const meta = {
  title: 'ui/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

// Hover the control to see the tooltip. The trigger is a plain button: an icon-only Button
// already brings its own Tooltip, and two would open together.
export const OnHover: Story = {
  args: {
    label: 'פתיחת התפריט',
    children: (
      <button
        type="button"
        aria-label="פתיחת התפריט"
        className="inline-grid size-11 place-items-center rounded-md bg-primary-soft text-primary-strong"
      >
        <MenuIcon />
      </button>
    ),
  },
};

// Opens by focus, as a keyboard user reaches the control.
export const OnFocus: Story = {
  args: { label: 'שמירה', children: <Button variant="soft">שמירה</Button> },
  play: async () => {
    await userEvent.tab();
  },
};
