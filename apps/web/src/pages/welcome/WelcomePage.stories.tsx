import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { WelcomePage } from './WelcomePage';

const meta = {
  title: 'pages/WelcomePage',
  component: WelcomePage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof WelcomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

// What a Guest sees at `/`: logo, illustration, heading, lead, and three actions with one primary.
export const Default: Story = {};
