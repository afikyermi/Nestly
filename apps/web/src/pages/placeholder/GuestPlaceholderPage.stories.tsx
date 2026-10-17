import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { SessionProvider } from '@/app/SessionProvider';
import { createControllableSessionSource } from '@/services/session/controllable-session-source';
import type { SessionState } from '@/services/session/session-source';
import { GuestPlaceholderPage } from './GuestPlaceholderPage';

function As({ state }: { state: SessionState }) {
  const [source] = useState(() => createControllableSessionSource(state));
  return (
    <SessionProvider source={source}>
      <MemoryRouter>
        <GuestPlaceholderPage title="תנאי השימוש" />
      </MemoryRouter>
    </SessionProvider>
  );
}

const meta = {
  title: 'pages/GuestPlaceholderPage',
  component: GuestPlaceholderPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GuestPlaceholderPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// A Guest: the way back leads to Welcome.
export const Guest: Story = { args: { title: 'תנאי השימוש' }, render: () => <As state="signed-out" /> };

// A signed-in user, from Settings: the way back leads to the Terms & Privacy section of Settings (F2.5 c7).
export const SignedIn: Story = { args: { title: 'תנאי השימוש' }, render: () => <As state="signed-in" /> };
