import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CommentView } from '@nestly/shared';
import { CommentsView } from './CommentsView';
import { EMPTY_COMPOSER, freshItem, type ThreadItem, type ThreadState } from './comments-state';
import { SEND_FAILED_TEXT } from './comments-texts';
import { DELETE_FAILED_TEXT } from './posts-texts';
import { REPORT_FAILED_TEXT } from '@/lib/report-texts';
import type { CommentWrites } from './use-comment-writes';
import type { ThreadFlow } from './use-comments';

// The comments region (F3.3 w1; F3.7's "⋯" and report window) in each of its states, drawn from props alone, as it sits under a post.
const noop = () => undefined;
const writes: CommentWrites = {
  root: EMPTY_COMPOSER,
  reply: null,
  confirm: null,
  changeRoot: noop,
  sendRoot: noop,
  openReply: noop,
  changeReply: noop,
  sendReply: noop,
  cancelReply: noop,
  askDelete: noop,
  cancelDelete: noop,
  confirmDelete: noop,
};
const base: ThreadState = { phase: 'ready', items: [], nextCursor: null, more: 'idle', postLiked: false, postLikes: 0, status: '' };

function flowOf(thread: ThreadState): ThreadFlow {
  return {
    thread,
    setThread: noop,
    focus: { tick: 0, target: { kind: 'heading' } },
    focusOn: noop,
    retry: noop,
    loadMore: noop,
    showMoreReplies: noop,
    toggleLike: noop,
  };
}

/** A comment's "⋯" menu open (F3.7), the report window over the region, or the anonymous post's own author (F3.4 c14). */
interface ScreenProps {
  thread: ThreadState;
  writes?: Partial<CommentWrites>;
  openMenuId?: string;
  report?: { commentId: string; failure?: string };
  asAnonymousAuthor?: boolean;
  /** False: a Professional writer, no name notice (professional-posting c12). */
  namesWriter?: boolean;
}

function Screen(props: ScreenProps) {
  const report =
    props.report === undefined
      ? null
      : {
          commentId: props.report.commentId,
          sheet: {
            targetKind: 'comment' as const,
            reason: props.report.failure === undefined ? null : ('harassment' as const),
            details: '',
            errors: {},
            sending: false,
            failure: props.report.failure ?? null,
            focus: { field: 'reason' as const, tick: 0 },
            rulesHref: '/community-rules',
            onReasonChange: noop,
            onDetailsChange: noop,
            onSend: noop,
            onCancel: noop,
          },
        };
  return (
    <main className="px-4 py-5">
      <div className="max-w-md">
        <CommentsView
          flow={flowOf(props.thread)}
          writes={{ ...writes, ...props.writes }}
          asAnonymousAuthor={props.asAnonymousAuthor ?? false}
          namesWriter={props.namesWriter ?? true}
          menu={{ openId: props.openMenuId ?? null, onOpenChange: noop, onPressOutside: noop, onReport: noop }}
          report={report}
        />
      </div>
    </main>
  );
}

const meta = { title: 'features/posts/CommentsView', component: Screen, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const comment = (id: string, patch: Partial<CommentView> = {}): CommentView => ({
  id,
  parentId: null,
  body: 'הלילות הראשונים הם הכי קשים. זה עובר, ואתם לא לבד.',
  createdAt: '2026-10-18T09:00:00.000Z',
  isMine: false,
  byAuthor: false,
  author: { name: 'נועה' },
  likeCount: 0,
  likedByMe: false,
  ...patch,
});
const reply = (id: string, patch: Partial<CommentView> = {}) => comment(id, { parentId: '00000000-0000-4000-8000-000000000001', body: 'תודה על התשובה', ...patch });
const withReplies = (item: ThreadItem, replies: CommentView[], replyCount = replies.length): ThreadItem => ({ ...item, replies, replyCount });
const first = withReplies(freshItem(comment('00000000-0000-4000-8000-000000000001', { likeCount: 3, likedByMe: true })), [
  reply('00000000-0000-4000-8000-000000000002', { author: { name: null } }),
  reply('00000000-0000-4000-8000-000000000003', { isMine: true, author: { name: 'אני' } }),
]);
// The anonymous post's author: no `author` key at all.
const author: ThreadItem = freshItem({
  id: '00000000-0000-4000-8000-000000000004',
  parentId: null,
  body: 'כותבת הפוסט כאן, תודה לכולם',
  createdAt: '2026-10-18T10:00:00.000Z',
  isMine: true,
  byAuthor: true,
  likeCount: 0,
  likedByMe: false,
});

export const Loading: Story = { args: { thread: { ...base, phase: 'loading' } } };
export const Empty: Story = { args: { thread: base } };
export const WithComments: Story = { args: { thread: { ...base, postLikes: 2, items: [first, author] } } };
export const MoreReplies: Story = { args: { thread: { ...base, items: [withReplies(first, first.replies, 25)] } } };
export const MoreRepliesFailed: Story = { args: { thread: { ...base, items: [{ ...withReplies(first, first.replies, 25), replyState: 'error' }] } } };
export const MoreComments: Story = { args: { thread: { ...base, items: [first], nextCursor: 'opaque' } } };
export const MoreCommentsFailed: Story = { args: { thread: { ...base, items: [first], nextCursor: 'opaque', more: 'error' } } };
export const LoadFailed: Story = { args: { thread: { ...base, phase: 'error' } } };
export const SendFailed: Story = { args: { thread: base, writes: { root: { ...EMPTY_COMPOSER, text: 'תגובה שלא נשלחה', failure: SEND_FAILED_TEXT } } } };
export const TooLong: Story = { args: { thread: base, writes: { root: { ...EMPTY_COMPOSER, text: 'א'.repeat(1001), error: 'long', validating: true } } } };
export const ReplyOpen: Story = {
  args: { thread: { ...base, items: [first] }, writes: { reply: { ...EMPTY_COMPOSER, parentId: first.id, text: 'שאלה' } } },
};
export const DeleteConfirm: Story = { args: { thread: { ...base, items: [first] }, writes: { confirm: { commentId: first.id, topLevel: true, saving: false, failure: null } } } };
export const DeleteFailed: Story = {
  args: { thread: { ...base, items: [first] }, writes: { confirm: { commentId: first.id, topLevel: true, saving: false, failure: DELETE_FAILED_TEXT } } },
};
// F3.4 c14: the real author of an anonymous post: both boxes say their comments show as "המחבר".
export const AsAnonymousAuthor: Story = {
  args: { thread: { ...base, items: [first, author] }, writes: { reply: { ...EMPTY_COMPOSER, parentId: first.id, text: '' } }, asAnonymousAuthor: true },
};
// F3.7: another person's comment's "⋯" (report), the viewer's own (delete, moved from F3.3's button), and the report window.
export const OthersCommentMenu: Story = { args: { thread: { ...base, items: [first] }, openMenuId: first.id } };
export const OwnCommentMenu: Story = { args: { thread: { ...base, items: [author] }, openMenuId: author.id } };
export const ReportOpen: Story = { args: { thread: { ...base, items: [first] }, report: { commentId: first.id } } };
export const ReportFailed: Story = { args: { thread: { ...base, items: [first] }, report: { commentId: first.id, failure: REPORT_FAILED_TEXT } } };
// professional-posting c12: a Professional writer: the comment and reply boxes without the name notice.
export const ProfessionalWriter: Story = {
  args: { thread: { ...base, items: [first] }, writes: { reply: { ...EMPTY_COMPOSER, parentId: first.id, text: '' } }, namesWriter: false },
};
