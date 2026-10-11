import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateInput } from './date-input';

const meta = {
  title: 'shared/DateInput',
  component: DateInput,
  parameters: { layout: 'padded' },
  args: { legend: 'תאריך לידה' },
} satisfies Meta<typeof DateInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = { args: { value: { day: '7', month: '6', year: '2026' } } };

export const ErrorState: Story = { args: { error: true, value: { day: '45', month: '', year: '2026' } } };

export const Disabled: Story = { args: { disabled: true, value: { day: '7', month: '6', year: '2026' } } };
