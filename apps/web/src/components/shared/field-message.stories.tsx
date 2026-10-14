import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldError, FieldHint } from './field-message';

const meta = {
  title: 'shared/FieldMessage',
  component: FieldHint,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FieldHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hint: Story = { args: { id: 'hint', children: 'אפשר לבחור יותר מאפשרות אחת.' } };

export const ErrorLine: Story = {
  args: { id: 'error', children: 'יש לבחור לפחות אפשרות אחת' },
  render: (args) => <FieldError {...args} />,
};
