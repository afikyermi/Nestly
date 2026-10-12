import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox';

const meta = {
  title: 'ui/Checkbox',
  component: Checkbox,
  parameters: { layout: 'padded' },
  args: {
    name: 'terms',
    children: (
      <>
        אישור <a href="#terms">תנאי השימוש</a> ו<a href="#privacy">מדיניות הפרטיות</a>
      </>
    ),
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = { args: { defaultChecked: false } };

export const Checked: Story = { args: { defaultChecked: true } };

export const ErrorState: Story = { args: { defaultChecked: false, error: true } };

export const Required: Story = { args: { defaultChecked: false, required: true } };

export const Disabled: Story = { args: { defaultChecked: true, disabled: true } };
