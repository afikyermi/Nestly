import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { SessionProvider } from '@/app/SessionProvider';
import { createControllableSessionSource } from '@/services/session/controllable-session-source';
import type { SessionState } from '@/services/session/session-source';
import { PrivacyPage } from './PrivacyPage';

function As({ state }: { state: SessionState }) {
  const [source] = useState(() => createControllableSessionSource(state));
  return <SessionProvider source={source}><MemoryRouter><PrivacyPage /></MemoryRouter></SessionProvider>;
}

const meta = {
  title: 'pages/PrivacyPage',
  component: PrivacyPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PrivacyPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = { render: () => <As state="signed-out" /> };
export const SignedIn: Story = { render: () => <As state="signed-in" /> };
