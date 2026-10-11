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

// Hover the control to see the tooltip.
export const OnHover: Story = {
  args: {
    label: 'פתיחת התפריט',
    children: (
      <Button variant="soft" iconOnly label="פתיחת התפריט">
        <MenuIcon />
      </Button>
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
