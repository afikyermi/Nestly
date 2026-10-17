import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { userEvent, within } from 'storybook/test';
import { ForcedPasswordForm } from './ForcedPasswordForm';

// The forced new-password screen (F2.0 c14) on its own, as it sits in the shell's `main`. With no session account, a valid submit
// shows the failure state (ERR-044, the field cleared); the held screen inside the shell is in app/ProtectedLayout's stories.
function Screen() {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <ForcedPasswordForm />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/forced-password/ForcedPasswordForm',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

// A submit with a short password: the VAL-003 field error.
export const PasswordTooShort: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('סיסמה חדשה'), 'abc');
    await userEvent.click(canvas.getByRole('button', { name: 'שמירת הסיסמה' }));
  },
};

// A valid password the server could not set: the ERR-044 alert, and the field is empty again.
export const Failed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('סיסמה חדשה'), 'a-long-enough-password');
    await userEvent.click(canvas.getByRole('button', { name: 'שמירת הסיסמה' }));
    await canvas.findByRole('alert');
  },
};
