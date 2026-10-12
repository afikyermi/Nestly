import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { HomeIcon, UserIcon } from '../ui/icons';
import { MenuItem } from './menu-item';
import { SideDrawer } from './side-drawer';

const meta = {
  title: 'shared/SideDrawer',
  component: SideDrawer,
  parameters: { layout: 'fullscreen' },
  args: { open: false, onOpenChange: () => undefined, title: 'תפריט', closeLabel: 'סגירת התפריט', children: null },
} satisfies Meta<typeof SideDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ initiallyOpen, ...rest }: { initiallyOpen: boolean } & Omit<React.ComponentProps<typeof SideDrawer>, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="p-4">
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        פתיחת התפריט
      </Button>
      <SideDrawer {...rest} open={open} onOpenChange={setOpen} />
    </div>
  );
}

const items = (
  <>
    <MenuItem href="#home" icon={<HomeIcon />}>
      בית
    </MenuItem>
    <MenuItem href="#profile" icon={<UserIcon />}>
      פרופיל
    </MenuItem>
    <MenuItem disabled onClick={() => undefined}>
      לא זמין
    </MenuItem>
  </>
);

// Closed on load: only the trigger is on the page.
export const Closed: Story = { render: (args) => <Demo {...args} initiallyOpen={false}>{items}</Demo> };

// Open: from the inline-start (right) edge, with a backdrop, a close control and the caller's items.
export const Open: Story = { render: (args) => <Demo {...args} initiallyOpen>{items}</Demo> };
