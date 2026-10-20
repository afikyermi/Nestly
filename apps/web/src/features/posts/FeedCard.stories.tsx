import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { FeedUnit } from '@nestly/shared';
import { FeedCard } from './FeedCard';

// A feed card (F3.2b, F3.3 c13) in each of its kinds, with its action row (like, the "תגובות" button, ux-polish-a c9) and
// the "more actions" button on every card (F3.9 c8), drawn from props alone. The links need a router.
function Screen(props: Parameters<typeof FeedCard>[0]) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <div role="feed" aria-label="פוסטים בפיד">
          <FeedCard onToggleLike={() => undefined} actions={[{ key: 'hide', label: 'הסתרת הפוסט', onSelect: () => undefined }]} {...props} />
        </div>
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/posts/FeedCard',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const common = { source: 'organic', audience: 'everyone', stageTag: null, createdAt: '2026-10-18T09:00:00.000Z', likeCount: 0, commentCount: 0, likedByMe: false } as const;
const named: FeedUnit = {
  ...common,
  id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01',
  kind: 'post',
  body: 'איך אתם מתמודדים עם לילות בלי שינה?\nאשמח לשמוע רעיונות.',
  isMine: false,
  isAnonymous: false,
  author: { name: 'נועה לוי' },
};

export const Named: Story = { args: { unit: named, position: 1 } };

export const LikedWithCounts: Story = { args: { unit: { ...named, likedByMe: true, likeCount: 12, commentCount: 3 }, position: 1 } };

export const WithTagAndFriendsOnly: Story = { args: { unit: { ...named, stageTag: 'pregnant', audience: 'friends' }, position: 2 } };

export const NameUnknown: Story = { args: { unit: { ...named, author: { name: null } }, position: 1 } };

export const MarkupShownAsText: Story = { args: { unit: { ...named, body: '<script>alert(1)</script> שלום' }, position: 1 } };

export const Anonymous: Story = {
  args: {
    unit: { ...common, id: '3b2e8f10-6d4a-4c1e-8a57-2c9d1e7f4b02', kind: 'post', body: 'שאלה שקשה לי לשאול בשם שלי.', isMine: false, isAnonymous: true },
    position: 3,
  },
};

const share: FeedUnit = {
  ...common,
  id: '9c4d2a61-1f7b-4e83-b5a0-6d8e3f2c1a03',
  kind: 'share',
  body: null,
  sharerText: 'מסכימה לגמרי עם מה שנכתב כאן.',
  isMine: false,
  isAnonymous: false,
  author: { name: 'דנה כהן' },
  original: { available: true, id: named.id, body: 'הטיפ הכי טוב שקיבלתי: לישון כשהתינוק ישן.', audience: 'everyone', createdAt: '2026-10-17T20:30:00.000Z', isAnonymous: false, isMine: false, author: { name: 'מיכל ברק' } },
};

export const Share: Story = { args: { unit: share, position: 1 } };

export const ShareOriginalUnavailable: Story = { args: { unit: { ...share, original: { available: false } }, position: 1 } };

// The viewer's own named card: its menu holds edit and delete (F3.9 c13).
export const OwnNamed: Story = {
  args: {
    unit: { ...named, isMine: true },
    position: 1,
    actions: [
      { key: 'edit', label: 'עריכת הפוסט', onSelect: () => undefined },
      { key: 'delete', label: 'מחיקת הפוסט', onSelect: () => undefined },
    ],
  },
};

// F3.5 c9, F3.6 c3: a card that can be shared has "שיתוף בפיד" and "שיתוף קישור" after "תגובות" (icon buttons, the name as tooltip).
export const Shareable: Story = { args: { unit: named, position: 1, onShareInFeed: () => undefined, onShareLink: () => undefined } };

// The viewer's own post: a link, but no share into the own feed (FR-FEED-006).
export const OwnLinkOnly: Story = { args: { unit: { ...named, isMine: true }, position: 1, onShareLink: () => undefined } };

// ux-polish-b c1, c2: the own card with F3.1's edit form in place of the body and the action row; the header stays.
const editing = {
  values: { body: 'איך אתם מתמודדים עם לילות בלי שינה?\nאשמח לשמוע רעיונות.', audience: 'everyone', stageTag: '' },
  errors: {},
  saving: false,
  failure: null,
  focus: { target: 'body', tick: 0 },
} as const;
export const OwnEditing: Story = { args: { unit: { ...named, isMine: true }, position: 1, edit: editing } };
export const OwnEditFailed: Story = {
  args: { unit: { ...named, isMine: true }, position: 1, edit: { ...editing, failure: 'השמירה לא הצליחה. אפשר לנסות שוב' } },
};
