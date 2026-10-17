import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { ConfirmDialog } from './confirm-dialog';

const meta = {
  title: 'shared/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'להסיר את הפריט?',
    description: 'הפרטים יימחקו ולא ניתן לשחזר אותם',
    confirmLabel: 'הסרה',
    cancelLabel: 'ביטול',
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo(args: React.ComponentProps<typeof ConfirmDialog>) {
  const [open, setOpen] = useState(args.open);
  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>פתיחה</Button>
      <ConfirmDialog {...args} open={open} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} />
    </div>
  );
}

// Open: the question names it, the consequence describes it, focus on "ביטול".
export const Open: Story = { render: (args) => <Demo {...args} /> };

// No description: a confirmation line only.
export const TitleOnly: Story = { render: (args) => <Demo {...args} description={undefined} title="מסלול 'מתכננים' יסתיים ויימחק" /> };

// In flight: the confirm control shows the loader and ignores a second press.
export const Pending: Story = { args: { pending: true } };

// The confirmed work failed: the dialog stays open with the alert.
export const Failed: Story = { args: { failure: 'הפעולה לא הצליחה. אפשר לנסות שוב' } };
