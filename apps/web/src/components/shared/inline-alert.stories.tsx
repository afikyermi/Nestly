import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineAlert } from './inline-alert';

const meta = {
  title: 'shared/InlineAlert',
  component: InlineAlert,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof InlineAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

// ERR-001 names the error; its wording is not decided, so this is neutral placeholder copy.
export const ErrorVariant: Story = { args: { variant: 'error', children: 'פרטי ההתחברות שגויים' } };

export const LongText: Story = {
  args: { children: 'פרטי ההתחברות שגויים. כדאי לבדוק את הפרטים ולנסות שוב.' },
};
