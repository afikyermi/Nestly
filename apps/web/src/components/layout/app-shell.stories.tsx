import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from '../ui/avatar';
import { BagIcon, HomeIcon, NestIcon, SparkIcon, UserIcon } from '../ui/icons';
import { MenuItem } from '../shared/menu-item';
import { AppShell } from './app-shell';

const meta = {
  title: 'layout/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const navItems = [
  { key: 'home', label: 'בית', href: '#home', icon: <HomeIcon /> },
  { key: 'shop', label: 'חנות', href: '#shop', icon: <BagIcon /> },
  { key: 'feed', label: 'פיד', href: '#posts', icon: <NestIcon />, current: true },
  { key: 'advisors', label: 'יועצים', href: '#advisors', icon: <SparkIcon /> },
  { key: 'profile', label: 'פרופיל', href: '#profile', icon: <Avatar name="נועה רז" decorative size="sm" /> },
];

const menu = (
  <>
    <MenuItem href="#home" icon={<HomeIcon />}>
      בית
    </MenuItem>
    <MenuItem href="#posts" icon={<NestIcon />}>
      פיד
    </MenuItem>
    <MenuItem href="#profile" icon={<UserIcon />}>
      פרופיל
    </MenuItem>
  </>
);

const args = {
  navItems,
  navLabel: 'ניווט ראשי',
  menuLabel: 'פתיחת התפריט',
  drawerTitle: 'תפריט',
  drawerCloseLabel: 'סגירת התפריט',
  skipLinkLabel: 'דילוג לתוכן הראשי',
  menu,
};

const post = (title: string) => (
  <article className="rounded-lg bg-card p-card-padding shadow-card">
    <h2 className="text-h3">{title}</h2>
    <p className="mt-1 text-body text-muted-foreground">טקסט לדוגמה בלבד, כדי לראות את הפריסה של העמוד בתוך המעטפת.</p>
  </article>
);

// A shell-shaped composition for the R2 comparison: a feed-like page inside the frame.
export const WithContent: Story = {
  args: {
    ...args,
    children: (
      <div className="flex flex-col gap-card-gap">
        <h1 className="text-h2">פיד</h1>
        {post('כותרת ראשונה')}
        {post('כותרת שנייה')}
        {post('כותרת שלישית')}
      </div>
    ),
  },
};

// Little content: the bar still meets the bottom edge of the viewport.
export const ShortContent: Story = {
  args: { ...args, children: <p className="text-body">עמוד קצר.</p> },
};
