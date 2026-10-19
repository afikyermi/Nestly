import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostAudience } from '@nestly/shared';
import { Button } from '@/components/ui/button';
import { ShareFeedSheet, type ShareFeedSheetProps } from './ShareFeedSheet';

const noop = () => undefined;

const meta = {
  title: 'features/posts/ShareFeedSheet',
  component: ShareFeedSheet,
  parameters: { layout: 'fullscreen' },
  args: {
    quote: { name: 'מיכל ברק', body: 'הטיפ הכי טוב שקיבלתי: לישון כשהתינוק ישן.', audience: 'everyone', createdAt: '2026-10-17T20:30:00.000Z' },
    text: '',
    audience: 'everyone',
    tooLong: false,
    sending: false,
    failure: null,
    focusTick: 0,
    onTextChange: noop,
    onAudienceChange: noop,
    onSend: noop,
    onCancel: noop,
  },
} satisfies Meta<typeof ShareFeedSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every story renders through Demo: the window is portaled to the body, so a page sits behind it (blurred) and the story root has a size.
// The text and the audience are kept here, so the window can be tried; below 1024 px it is a bottom sheet, from 1024 px a small window.
function Demo(args: ShareFeedSheetProps) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(args.text);
  const [audience, setAudience] = useState<PostAudience>(args.audience);
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="max-w-md text-body">הלילות הראשונים הם הכי קשים. זה עובר, ואתם לא לבד.</p>
      <Button onClick={() => setOpen(true)}>פתיחה</Button>
      {open ? (
        <ShareFeedSheet {...args} text={text} audience={audience} onTextChange={setText} onAudienceChange={setAudience} onCancel={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

// F3.5 c10: the quote, an empty text box in focus, "כולם" chosen.
export const Empty: Story = { render: (args) => <Demo {...args} /> };

// The audience the composer stored (1א): "חברים בלבד"; an author whose name is not shown: "מהקהילה".
export const FriendsNoName: Story = {
  args: { audience: 'friends', quote: { name: null, body: 'מישהו מכיר גן טוב באזור?', audience: 'everyone', createdAt: '2026-10-17T20:30:00.000Z' } },
  render: (args) => <Demo {...args} />,
};

// Over the limit after a send: the counter says by how much, and the too-long message.
export const TooLong: Story = { args: { text: 'א'.repeat(2005), tooLong: true }, render: (args) => <Demo {...args} /> };

// In flight: "משתפים", disabled, one request.
export const Sending: Story = { args: { text: 'שווה לקרוא', sending: true }, render: (args) => <Demo {...args} /> };

// ERR-034: the post cannot be shared; no reason, no retry, the text kept.
export const NotShareable: Story = {
  args: { text: 'שווה לקרוא', failure: { text: 'אי אפשר לשתף את הפוסט הזה', retry: false } },
  render: (args) => <Demo {...args} />,
};

// ERR-004: no answer; "נסו שוב", the text kept.
export const Failed: Story = {
  args: { text: 'שווה לקרוא', failure: { text: 'השיתוף לא פורסם. אפשר לנסות שוב', retry: true } },
  render: (args) => <Demo {...args} />,
};
