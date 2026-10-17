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
function SignedInAt({ path, mustSetPassword = false }: { path: string; mustSetPassword?: boolean }) {
  const [source] = useState(() => {
    const created = createControllableSessionSource('signed-in');
    // F2.0 c14: held on the new-password screen, with the questions still missing behind it.
    if (mustSetPassword) {
      created.setNeedsRecoveryQuestions(true);
      created.setMustSetPassword(true);
    }
    return created;
  });
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

// F2.4b: the Friends page, reached from the menu (the lists load from the real API, so in Storybook they show the load failure).
export const FriendsNoneCurrent: Story = { render: () => <SignedInAt path={PATHS.friends} /> };

// F2.0 c15: the password-change screen, reached from the menu.
export const ChangePassword: Story = { render: () => <SignedInAt path={PATHS.changePassword} /> };

// F2.0 c14: after a takeover clear any route lands on the forced new-password screen.
export const MustSetNewPassword: Story = { render: () => <SignedInAt path={PATHS.feed} mustSetPassword /> };

// The side menu open: Friends, Settings, the recovery questions, the password change and Logout.
export const DrawerOpen: Story = {
  render: () => <SignedInAt path={PATHS.feed} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'פתיחת התפריט' }));
  },
};
