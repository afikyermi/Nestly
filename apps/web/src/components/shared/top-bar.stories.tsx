import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { UserIcon } from '../ui/icons';
import { TopBar } from './top-bar';

const meta = {
  title: 'shared/TopBar',
  component: TopBar,
  parameters: { layout: 'fullscreen' },
  args: { menuLabel: 'פתיחת התפריט', onMenuClick: () => undefined },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Hamburger at the right edge, then the logo; nothing else until a caller adds actions.
export const Default: Story = {};

// The actions slot takes caller nodes at the inline-end edge.
export const WithActions: Story = {
  args: {
    actions: (
      <Button iconOnly label="פרופיל" href="#profile">
        <UserIcon />
      </Button>
    ),
  },
};
