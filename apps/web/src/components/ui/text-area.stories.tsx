import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextArea } from './text-area';

const meta = {
  title: 'ui/TextArea',
  component: TextArea,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories name the field with aria-label; in screens FormField supplies the label.
export const Empty: Story = { args: { 'aria-label': 'מה תרצו לשתף?' } };

export const Filled: Story = {
  args: { 'aria-label': 'מה תרצו לשתף?', defaultValue: 'איך אתם מתמודדים עם לילות בלי שינה?\nאשמח לשמוע רעיונות.' },
};

export const ErrorState: Story = { args: { 'aria-label': 'מה תרצו לשתף?', error: true } };

export const Disabled: Story = { args: { 'aria-label': 'מה תרצו לשתף?', defaultValue: 'טקסט', disabled: true } };
