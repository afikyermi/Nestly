import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from '../ui/avatar';
import { BagIcon, HomeIcon, NestIcon, SparkIcon } from '../ui/icons';
import { BottomNavigation } from './bottom-navigation';

const meta = {
  title: 'shared/BottomNavigation',
  component: BottomNavigation,
  parameters: { layout: 'fullscreen' },
  args: { label: 'ניווט ראשי', items: [] },
  // The bar's position comes from its container: a full-height page frame, as AppShell gives it.
  decorators: [
    (Story) => (
      <div className="flex min-h-dvh flex-col justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BottomNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

const home = { key: 'home', label: 'בית', href: '#home', icon: <HomeIcon /> };
const shop = { key: 'shop', label: 'חנות', href: '#shop', icon: <BagIcon /> };
const feed = { key: 'feed', label: 'פיד', href: '#posts', icon: <NestIcon />, current: true };
const advisors = { key: 'advisors', label: 'יועצים', href: '#advisors', icon: <SparkIcon /> };
const profile = { key: 'profile', label: 'פרופיל', href: '#profile', icon: <Avatar name="נועה רז" decorative size="sm" /> };

// The MVP destinations of a Regular user (AC-005): home, feed, profile.
export const ThreeItems: Story = { args: { items: [home, feed, profile] } };

// All five destinations, once the shop and the advisors exist.
export const FiveItems: Story = { args: { items: [home, shop, feed, advisors, profile] } };
