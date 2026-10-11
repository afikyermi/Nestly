import type { Meta, StoryObj } from '@storybook/react-vite';
import { PasswordInput } from './password-input';

const meta = {
  title: 'shared/PasswordInput',
  component: PasswordInput,
  parameters: { layout: 'padded' },
  args: { 'aria-label': 'סיסמה', toggleLabel: 'הצגת הסיסמה' },
} satisfies Meta<typeof PasswordInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { autoComplete: 'current-password' } };

export const Filled: Story = { args: { autoComplete: 'current-password', defaultValue: 'ציפור בקן שלי' } };

// Unmet rules are plain text; a met rule starts with a check mark, so it is not colour alone.
export const WithRules: Story = {
  args: {
    autoComplete: 'new-password',
    defaultValue: 'ציפור',
    rules: [{ id: 'length', text: 'לפחות 10 תווים', met: false }],
  },
};

export const RulesMet: Story = {
  args: {
    autoComplete: 'new-password',
    defaultValue: 'ציפור בקן שלי',
    rules: [{ id: 'length', text: 'לפחות 10 תווים', met: true }],
  },
};

export const ErrorState: Story = { args: { autoComplete: 'current-password', error: true } };

export const Disabled: Story = { args: { autoComplete: 'current-password', disabled: true } };
