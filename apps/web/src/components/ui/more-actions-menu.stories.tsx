import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoreActionsMenu } from './more-actions-menu';

// The "more actions" button of a feed card and its menu (F3.9 c8; F3.7 adds "דיווח על הפוסט" to the same menu).
const meta = {
  title: 'ui/MoreActionsMenu',
  component: MoreActionsMenu,
  parameters: { layout: 'padded' },
  args: {
    label: 'פעולות נוספות לפוסט',
    menuLabel: 'פעולות נוספות',
    items: [
      { key: 'hide', label: 'הסתרת הפוסט', onSelect: () => undefined },
      { key: 'report', label: 'דיווח על הפוסט', onSelect: () => undefined },
    ],
  },
} satisfies Meta<typeof MoreActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// Closed: only the icon button (its tooltip is its name).
export const Closed: Story = {};

// Open, focus on the first item: someone else's card, hide and report (F3.9, F3.7).
export const Open: Story = { args: { defaultOpen: true } };

// The viewer's own named card: edit and delete (F3.9 c13).
export const OwnCard: Story = {
  args: {
    defaultOpen: true,
    items: [
      { key: 'edit', label: 'עריכת הפוסט', onSelect: () => undefined },
      { key: 'delete', label: 'מחיקת הפוסט', onSelect: () => undefined },
    ],
  },
};

// The item while its request is in flight: disabled.
export const ItemPending: Story = {
  args: { defaultOpen: true, items: [{ key: 'hide', label: 'הסתרת הפוסט', onSelect: () => undefined, disabled: true }] },
};
