import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { ShareLinkSheet, type ShareLinkSheetProps } from './share-link-sheet';

const noop = () => undefined;

const meta = {
  title: 'domain/ShareLinkSheet',
  component: ShareLinkSheet,
  parameters: { layout: 'fullscreen' },
  args: {
    heading: 'שיתוף קישור',
    title: 'פוסט ב-Nestly',
    url: 'https://nestly.example/posts/7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01',
    canShareDevice: false,
    copy: 'idle',
    copyTick: 0,
    onCopy: noop,
    onMore: noop,
    onClose: noop,
  },
} satisfies Meta<typeof ShareLinkSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every story renders through Demo: the window is portaled to the body, so a page sits behind it (blurred) and the story root has a size.
// Below 1024 px it is a bottom sheet, from 1024 px a small window.
function Demo(args: ShareLinkSheetProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="max-w-md text-body">הלילות הראשונים הם הכי קשים. זה עובר, ואתם לא לבד.</p>
      <Button onClick={() => setOpen(true)}>פתיחה</Button>
      {open ? <ShareLinkSheet {...args} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

// A post's link (F3.6 c4): WhatsApp, email and copy; focus on the first option. No device share sheet in this browser.
export const Post: Story = { render: (args) => <Demo {...args} /> };

// The device has its own share sheet: "אפשרויות נוספות" is offered too.
export const WithDeviceShare: Story = { args: { canShareDevice: true }, render: (args) => <Demo {...args} /> };

// The site link from the side menu (c11): another name, the same options.
export const Site: Story = { args: { heading: 'שיתוף Nestly', title: 'Nestly', url: 'https://nestly.example/' }, render: (args) => <Demo {...args} /> };

// Copied (c5): the quiet status inside the window.
export const Copied: Story = { args: { copy: 'copied', copyTick: 1 }, render: (args) => <Demo {...args} /> };

// The clipboard refused (c5): the alert and the link in a read-only field, selected.
export const CopyFailed: Story = { args: { copy: 'shown', copyTick: 1 }, render: (args) => <Demo {...args} /> };
