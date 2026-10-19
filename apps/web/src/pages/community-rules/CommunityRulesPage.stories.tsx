import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { CommunityRulesPage } from './CommunityRulesPage';

// The community rules page (F3.7, PG-049) as it sits in the shell's `main`: the heading, BR-075's eight rules and the closing line.
function Screen() {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <CommunityRulesPage />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'pages/CommunityRulesPage',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
