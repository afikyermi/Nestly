import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { FeedUnit } from '@nestly/shared';
import { FeedCard } from './FeedCard';

// A feed card (F3.2b) in each of its kinds, drawn from props alone. The link needs a router.
function Screen(props: Parameters<typeof FeedCard>[0]) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <div role="feed" aria-label="פוסטים בפיד">
          <FeedCard {...props} />
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
  original: { available: true, id: named.id, body: 'הטיפ הכי טוב שקיבלתי: לישון כשהתינוק ישן.', audience: 'everyone', createdAt: '2026-10-17T20:30:00.000Z', isAnonymous: false, author: { name: 'מיכל ברק' } },
};

export const Share: Story = { args: { unit: share, position: 1 } };

export const ShareOriginalUnavailable: Story = { args: { unit: { ...share, original: { available: false } }, position: 1 } };
