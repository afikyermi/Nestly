import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { createControllableSessionSource } from '@/services/session/controllable-session-source';
import { AppRoutes } from './AppRoutes';
import { PATHS } from './paths';
import { ProtectedLayout } from './ProtectedLayout';
import { SessionProvider } from './SessionProvider';

// The composed shell, through the real routes and guard, with a signed-in session. Nobody can sign in on
// the Preview until F1.5, so these stories are where the signed-in shell is seen.
function SignedInAt({ path }: { path: string }) {
  const [source] = useState(() => createControllableSessionSource('signed-in'));
  return (
    <SessionProvider source={source}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </SessionProvider>
  );
}

const meta = {
  title: 'app/ProtectedLayout',
  component: ProtectedLayout,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProtectedLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HomeCurrent: Story = { render: () => <SignedInAt path={PATHS.home} /> };

export const FeedCurrent: Story = { render: () => <SignedInAt path={PATHS.feed} /> };

export const ProfileCurrent: Story = { render: () => <SignedInAt path={PATHS.profile} /> };

// Settings is reached from the menu, not the navigation: no nav item is current.
export const SettingsNoneCurrent: Story = { render: () => <SignedInAt path={PATHS.settings} /> };

// The side menu open: Settings and Logout.
export const DrawerOpen: Story = {
  render: () => <SignedInAt path={PATHS.feed} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'פתיחת התפריט' }));
  },
};
