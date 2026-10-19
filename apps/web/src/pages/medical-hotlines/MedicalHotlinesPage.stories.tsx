import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { MedicalHotlinesPage } from './MedicalHotlinesPage';

// The medical hotlines page (F3.8) as it sits in the shell's `main`: the heading, the disclaimer and the call links of MEDICAL_HOTLINES.
function Screen() {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <MedicalHotlinesPage />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'pages/MedicalHotlinesPage',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
