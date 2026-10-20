import type { Meta, StoryObj } from '@storybook/react-vite';
import { MediaTile } from './media-tile';

// A tiny inline picture so the stories need no network.
const PICTURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="lightsteelblue"/><circle cx="200" cy="150" r="70" fill="peachpuff"/></svg>');
const base = { id: '11111111-1111-4111-8111-111111111111', width: 400, height: 300 };

const meta = {
  title: 'shared/MediaTile',
  component: MediaTile,
  parameters: { layout: 'padded' },
  args: { alt: 'תמונה בפוסט', className: 'h-48 w-64' },
} satisfies Meta<typeof MediaTile>;

export default meta;
type Story = StoryObj<typeof meta>;

// Checked: shown as is.
export const Ready: Story = { args: { image: { ...base, state: 'ready', url: PICTURE } } };

// The uploader's own image before the check (AC-105): the label over it.
export const Pending: Story = { args: { image: { ...base, state: 'pending', url: PICTURE } } };

// Refused (ERR-041 as of 20.10.2026): no picture, one quiet sentence.
export const Rejected: Story = { args: { image: { ...base, state: 'rejected', url: null } } };

// No read address this time.
export const Unavailable: Story = { args: { image: { ...base, state: 'ready', url: null } } };
