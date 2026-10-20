import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { CommentView, FeedUnit } from '@nestly/shared';
import { CardComments, type CardCommentsActions } from './CardComments';
import { FeedCard } from './FeedCard';
import { initialThread, type CardThread } from './card-comments-state';
import { EMPTY_COMPOSER, freshItem, type ThreadItem } from './comments-state';
import { SEND_FAILED_TEXT } from './comments-texts';

// The comments inside a feed card (ux-polish-a; direction.md "תגובות | בתוך הכרטיס") in each of its states, drawn from props alone inside the
// card, as on /feed: the preview, expanded with replies, the reply box, the field with each notice, loading, the load errors, a post gone, a
// comment's "⋯" open.
const noop = () => undefined;
const actions: CardCommentsActions = {
  onRetry: noop,
  onMore: noop,
  onMoreReplies: noop,
  onLike: noop,
  onReply: noop,
  onRootChange: noop,
  onRootSend: noop,
  onReplyChange: noop,
  onReplySend: noop,
  onReplyCancel: noop,
};

const named: FeedUnit = {
  id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01',
  kind: 'post',
  source: 'organic',
  body: 'איך אתם מתמודדים עם לילות בלי שינה?',
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-10-18T09:00:00.000Z',
  likeCount: 4,
  commentCount: 5,
  likedByMe: false,
  isMine: false,
  isAnonymous: false,
  author: { name: 'נועה לוי' },
};
const anonymous: FeedUnit = { ...named, id: '3b2e8f10-6d4a-4c1e-8a57-2c9d1e7f4b02', isMine: false, isAnonymous: true };

const comment = (n: number, extra: Partial<CommentView> = {}): CommentView => ({
  id: `c0000000-0000-4000-8000-00000000000${n}`,
  parentId: null,
  body: `תגובה מספר ${n}: גם אצלנו זה ככה, זה עובר.`,
  createdAt: `2026-10-18T1${n}:00:00.000Z`,
  isMine: false,
  byAuthor: false,
  author: { name: 'דנה כהן' },
  likeCount: n,
  likedByMe: false,
  ...extra,
});
const reply = (n: number): CommentView => ({ ...comment(n), id: `d0000000-0000-4000-8000-00000000000${n}`, parentId: comment(1).id, body: 'השבה קצרה.' });
const withReplies: ThreadItem = { ...freshItem(comment(1)), replies: [reply(6), reply(7)], replyCount: 3 };
const items: ThreadItem[] = [
  withReplies,
  freshItem(comment(2, { isMine: true, author: { name: 'אני' } })),
  freshItem(comment(3, { byAuthor: true, author: undefined })),
  freshItem(comment(4)),
];
const ready: CardThread = { ...initialThread(named), phase: 'ready', items };

interface ScreenProps {
  unit: FeedUnit;
  thread: CardThread;
  openMenuId?: string;
}

function Screen({ unit, thread, openMenuId }: ScreenProps) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <div role="feed" aria-label="פוסטים בפיד">
          <FeedCard
            unit={unit}
            position={1}
            onToggleLike={noop}
            actions={[{ key: 'hide', label: 'הסתרת הפוסט', onSelect: noop }]}
            comments={
              <CardComments
                thread={thread}
                actions={actions}
                menu={{ openId: openMenuId ?? null, onOpenChange: noop, onDelete: noop, onReport: noop }}
              />
            }
          />
        </div>
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/posts/CardComments',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

// c1: the first two top-level comments, replies not shown ("הצגת עוד השבות"), and "הצגת עוד תגובות".
export const Preview: Story = { args: { unit: named, thread: ready } };

// c2: every loaded comment, the first one's replies open, another page still on the server.
export const ExpandedWithReplies: Story = {
  args: { unit: named, thread: { ...ready, expanded: true, openReplies: [withReplies.id], nextCursor: 'next' } },
};

// c5: F3.3's reply box under a comment, inside the card.
export const ReplyBox: Story = { args: { unit: named, thread: { ...ready, reply: { ...EMPTY_COMPOSER, parentId: withReplies.id, text: 'תודה!' } } } };

// c1, c4: a card without comments: the field only, with the name notice.
export const FieldOnly: Story = { args: { unit: { ...named, commentCount: 0 }, thread: initialThread({ ...named, commentCount: 0 }) } };

// c6: the anonymous post's real author: the "המחבר" notice under the field.
export const AnonymousAuthorNotice: Story = { args: { unit: anonymous, thread: { ...ready, asAuthor: true } } };

// c6: an anonymous card before GET /posts/:id answered: no field.
export const AnonymousUnknown: Story = { args: { unit: anonymous, thread: { ...ready, asAuthor: null } } };

// c4: a send that failed keeps the text, with F3.3's failure.
export const SendFailed: Story = { args: { unit: named, thread: { ...ready, root: { ...EMPTY_COMPOSER, text: 'מה שכתבתי', failure: SEND_FAILED_TEXT } } } };

// c3: loading (two skeleton lines, the field stays), the first page failed, the next page failed, the post gone.
export const Loading: Story = { args: { unit: named, thread: { ...initialThread(named), phase: 'loading' } } };
export const LoadFailed: Story = { args: { unit: named, thread: { ...initialThread(named), phase: 'error' } } };
export const MoreFailed: Story = { args: { unit: named, thread: { ...ready, expanded: true, nextCursor: 'next', more: 'error' } } };
export const PostGone: Story = { args: { unit: named, thread: { ...initialThread(named), phase: 'gone' } } };

// c7: a comment's "⋯" open (another's: "דיווח על התגובה").
export const CommentMenuOpen: Story = { args: { unit: named, thread: ready, openMenuId: withReplies.id } };
