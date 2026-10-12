import type { Meta, StoryObj } from '@storybook/react-vite';
import { StepIndicator } from './step-indicator';

const meta = {
  title: 'shared/StepIndicator',
  component: StepIndicator,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StepIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstOfTwo: Story = { args: { current: 1, total: 2 } };

export const LastOfTwo: Story = { args: { current: 2, total: 2 } };
