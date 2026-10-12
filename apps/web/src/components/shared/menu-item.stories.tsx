import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronForwardIcon, HomeIcon, UserIcon } from '../ui/icons';
import { MenuItem } from './menu-item';

// Destinations named in FR-MENU-001: the user's groups, friends, terms and privacy, support, logout.
const meta = {
  title: 'shared/MenuItem',
  component: MenuItem,
  parameters: { layout: 'padded' },
  args: { children: 'הקבוצות שלי', icon: <HomeIcon /> },
} satisfies Meta<typeof MenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AsLink: Story = { args: { href: '#groups' } };

export const AsButton: Story = { args: { children: 'התנתקות', icon: <UserIcon />, onClick: () => undefined } };

export const Disabled: Story = { args: { children: 'בקשת תמיכה', onClick: () => undefined, disabled: true } };

export const WithoutIcon: Story = { args: { children: 'תנאי שימוש ופרטיות', href: '#terms', icon: undefined } };

export const Stacked: Story = {
  render: () => (
    <nav aria-label="תפריט">
      <MenuItem href="#groups" icon={<HomeIcon />}>
        הקבוצות שלי
      </MenuItem>
      <MenuItem href="#friends" icon={<UserIcon />}>
        חברים
      </MenuItem>
      <MenuItem href="#terms" icon={<ChevronForwardIcon />}>
        תנאי שימוש ופרטיות
      </MenuItem>
    </nav>
  ),
};
