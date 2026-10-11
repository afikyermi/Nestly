import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from '../ui/text-input';
import { FormField } from './form-field';

const meta = {
  title: 'shared/FormField',
  component: FormField,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

const field = (control: Parameters<Parameters<typeof FormField>[0]['children']>[0]) => (
  <TextInput {...control} name="first-name" />
);

export const Basic: Story = { args: { label: 'שם פרטי', children: field } };

export const WithHint: Story = { args: { label: 'שם פרטי', hint: 'כך יופיע שמך בקהילה', children: field } };

export const WithError: Story = {
  args: { label: 'שם פרטי', error: 'יש למלא שם פרטי', children: field },
};

export const Optional: Story = { args: { label: 'שם משפחה', optional: true, children: field } };
