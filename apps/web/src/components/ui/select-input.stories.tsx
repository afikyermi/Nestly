import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectInput } from './select-input';

const options = [
  { value: 'f', label: 'אישה' },
  { value: 'm', label: 'גבר' },
  { value: 'o', label: 'אחר' },
  { value: 'n', label: 'מעדיפים לא לציין' },
];

const meta = {
  title: 'ui/SelectInput',
  component: SelectInput,
  parameters: { layout: 'padded' },
  args: { 'aria-label': 'מין', placeholder: 'בחירה', options },
} satisfies Meta<typeof SelectInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Placeholder: Story = { args: { value: '' } };

export const Selected: Story = { args: { value: 'f' } };

export const ErrorState: Story = { args: { value: '', error: true } };

export const Disabled: Story = { args: { value: 'm', disabled: true } };
