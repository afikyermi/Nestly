import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReportReason } from '@nestly/shared';
import { Button } from '../ui/button';
import { ReportSheet, type ReportSheetProps } from './report-sheet';

const noop = () => undefined;

const meta = {
  title: 'domain/ReportSheet',
  component: ReportSheet,
  parameters: { layout: 'fullscreen' },
  args: {
    targetKind: 'post',
    reason: null,
    details: '',
    errors: {},
    sending: false,
    failure: null,
    focus: { field: 'reason', tick: 0 },
    rulesHref: '/community-rules',
    onReasonChange: noop,
    onDetailsChange: noop,
    onSend: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof ReportSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every story renders through Demo: the window is portaled to the body, so a page sits behind it (blurred) and the story root has a size.
// The choice and the text are kept here, so the window can be tried; below 1024 px it is a bottom sheet, from 1024 px a small window.
function Demo(args: ReportSheetProps) {
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState<ReportReason | null>(args.reason);
  const [details, setDetails] = useState(args.details);
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="max-w-md text-body">הלילות הראשונים הם הכי קשים. זה עובר, ואתם לא לבד.</p>
      <Button onClick={() => setOpen(true)}>פתיחה</Button>
      {open ? (
        <ReportSheet {...args} reason={reason} details={details} onReasonChange={setReason} onDetailsChange={setDetails} onCancel={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

// A post: eight reasons in FR-MOD-001's order, none chosen, focus on the first.
export const Post: Story = { render: (args) => <Demo {...args} /> };

// A comment and a profile: only the name changes.
export const Comment: Story = { args: { targetKind: 'comment' }, render: (args) => <Demo {...args} /> };
export const Profile: Story = { args: { targetKind: 'user' }, render: (args) => <Demo {...args} /> };

// Sent with nothing chosen: the reason's message, focus on the first reason.
export const NoReason: Story = { args: { errors: { reason: 'required' } }, render: (args) => <Demo {...args} /> };

// "אחר" with no text: the text's message.
export const OtherWithoutText: Story = { args: { reason: 'other', errors: { details: 'required' } }, render: (args) => <Demo {...args} /> };

// Over the limit: the counter says by how much, and the text's message.
export const TooLong: Story = {
  args: { reason: 'harassment', details: 'א'.repeat(1003), errors: { details: 'long' } },
  render: (args) => <Demo {...args} />,
};

// In flight: "שולחים", one request.
export const Sending: Story = { args: { reason: 'spam', sending: true }, render: (args) => <Demo {...args} /> };

// The request did not get an answer (ERR-004): the window stays with what was chosen and written.
export const Failed: Story = {
  args: { reason: 'child_safety', details: 'פרטים', failure: 'הדיווח לא נשלח. אפשר לנסות שוב' },
  render: (args) => <Demo {...args} />,
};
