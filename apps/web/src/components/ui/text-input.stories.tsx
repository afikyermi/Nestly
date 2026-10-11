import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from './text-input';

const meta = {
  title: 'ui/TextInput',
  component: TextInput,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories name the field with aria-label; in screens FormField supplies the label.
export const Empty: Story = { args: { 'aria-label': 'שם פרטי' } };

export const Filled: Story = { args: { 'aria-label': 'שם פרטי', defaultValue: 'נועה' } };

export const ErrorState: Story = { args: { 'aria-label': 'שם פרטי', defaultValue: 'נ', error: true } };

export const Disabled: Story = { args: { 'aria-label': 'שם פרטי', defaultValue: 'נועה', disabled: true } };

// LTR content inside the RTL form: the text starts at the start edge.
export const Email: Story = {
  args: { 'aria-label': 'אימייל', type: 'email', dir: 'ltr', autoComplete: 'email', defaultValue: 'noa@example.com' },
};
