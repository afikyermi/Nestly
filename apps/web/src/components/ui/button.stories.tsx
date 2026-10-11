import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { MenuIcon, PlusIcon } from './icons';

const meta = {
  title: 'ui/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { children: 'המשך' } };

export const Soft: Story = {
  args: { variant: 'soft', children: 'הוספת פריט' },
  render: (args) => (
    <Button {...args}>
      <PlusIcon className="size-5" />
      הוספת פריט
    </Button>
  ),
};

export const Text: Story = { args: { variant: 'text', children: 'ביטול' } };

export const Large: Story = { args: { size: 'lg', children: 'התחלה' } };

export const Block: Story = {
  args: { block: true, children: 'המשך' },
  parameters: { layout: 'padded' },
};

export const IconOnly: Story = {
  render: () => (
    <Button iconOnly label="פתיחת התפריט">
      <MenuIcon />
    </Button>
  ),
};

export const Disabled: Story = { args: { disabled: true, children: 'המשך' } };

// The label stays, a loader shows at the inline start, the button is busy but not disabled.
export const Pending: Story = { args: { pending: true, children: 'שליחה' } };

// Welcome-screen calls to action are links that look like buttons.
export const AsLink: Story = { args: { href: '#welcome', size: 'lg', children: 'התחלה' } };
