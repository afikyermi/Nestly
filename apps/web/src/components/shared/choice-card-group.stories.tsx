import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChoiceCardGroup } from './choice-card-group';

// The stage options of FR-REG-002.
const options = [
  { value: 'planning', label: 'מתכננים' },
  { value: 'pregnant', label: 'בהריון' },
  { value: 'parent', label: 'יש לנו ילד או ילדה' },
];

const meta = {
  title: 'shared/ChoiceCardGroup',
  component: ChoiceCardGroup,
  parameters: { layout: 'padded' },
  args: { legend: 'השלב במסע', name: 'stage', options },
} satisfies Meta<typeof ChoiceCardGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = { args: { value: null } };

export const Selected: Story = { args: { value: 'pregnant' } };

// Interactive: click or use the arrow keys.
export const Interactive: Story = {
  render: (args) => {
    const [value, setValue] = useState<string | null>('parent');
    return <ChoiceCardGroup legend={args.legend} name={args.name} options={args.options} value={value} onChange={setValue} />;
  },
};

export const ErrorState: Story = { args: { value: null, error: true } };

export const Disabled: Story = { args: { value: 'planning', disabled: true } };
