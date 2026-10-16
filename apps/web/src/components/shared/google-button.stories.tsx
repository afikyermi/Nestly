import type { Meta, StoryObj } from '@storybook/react-vite';
import { GoogleButton } from './google-button';

const meta = {
  title: 'shared/GoogleButton',
  component: GoogleButton,
  parameters: { layout: 'padded' },
  args: { onPress: () => undefined },
  decorators: [
    (Story) => (
      <div className="flex max-w-md flex-col gap-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GoogleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Pressed: disabled and busy until the browser leaves.
export const Busy: Story = { args: { busy: true } };

// Auth is not configured, or Google could not be started (F1.8 criterion 3 text).
export const Failed: Story = {
  args: { message: 'לא הצלחנו להשלים את הכניסה עם Google. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה.' },
};
