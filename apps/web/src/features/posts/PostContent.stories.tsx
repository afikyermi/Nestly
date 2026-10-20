import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { PostReadView, ShareReadView } from '@nestly/shared';
import { PostContent } from './PostContent';
import { CONFIRM_DELETE_LABEL, DELETE_FAILED_TEXT, LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './posts-texts';
import { EDIT_ITEM_LABEL } from './hide-texts';
import { POST_REPORTED_STATUS, REPORT_POST_ITEM, REPORT_UNAVAILABLE_STATUS } from '@/lib/report-texts';

// One post (F3.1b) in each of its states, drawn from props alone, as it sits in the shell's `main`. Links need a router.
function Screen(props: Parameters<typeof PostContent>[0]) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <PostContent {...props} />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/posts/PostContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const post: PostReadView = {
  kind: 'post',
  id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01',
  body: 'איך אתם מתמודדים עם לילות בלי שינה?\nאשמח לשמוע רעיונות.',
  audience: 'friends',
  stageTag: 'has_child',
  createdAt: '2026-10-18T09:00:00.000Z',
  isAnonymous: false,
  isMine: true,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
};
const loaded = { kind: 'loaded', status: '', failure: null, edit: null, confirm: null } as const;
const editValues = { body: post.body ?? '', audience: post.audience, stageTag: 'has_child' } as const;

const noop = () => undefined;
// The author's own "⋯" (ux-polish-b c3): edit and delete; a share has delete only.
const ownActions = [
  { key: 'edit', label: EDIT_ITEM_LABEL, onSelect: noop },
  { key: 'delete', label: CONFIRM_DELETE_LABEL, onSelect: noop },
];
const ownShareActions = [{ key: 'delete', label: CONFIRM_DELETE_LABEL, onSelect: noop }];
export const Loaded: Story = { args: { view: { ...loaded, post }, moreActions: ownActions } };
export const OwnMenuOpen: Story = { args: { view: { ...loaded, post }, moreActions: ownActions, menuOpen: true } };
// Someone else's post: the "⋯" with "דיווח על הפוסט" (F3.7 c9).
const others: PostReadView = { ...post, isMine: false, stageTag: null, audience: 'everyone' };
const moreActions = [{ key: 'report', label: REPORT_POST_ITEM, onSelect: noop }];
export const OthersPost: Story = { args: { view: { ...loaded, post: others }, moreActions } };
export const OthersPostMenu: Story = { args: { view: { ...loaded, post: others }, moreActions, menuOpen: true } };
// F3.7 c13: the report went through: the post is replaced by the paragraph and "חזרה לפיד".
export const Reported: Story = { args: { view: { kind: 'reported', text: POST_REPORTED_STATUS } } };
// 404 on the report: the post stays, the status says so.
export const ReportUnavailable: Story = { args: { view: { ...loaded, post: others, status: REPORT_UNAVAILABLE_STATUS }, moreActions } };
// The report window over the post.
export const ReportOpen: Story = {
  args: {
    view: { ...loaded, post: others },
    moreActions,
    report: {
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
  },
};
export const Editing: Story = {
  args: { view: { ...loaded, post, edit: { values: editValues, errors: {}, saving: false, failure: null } } },
};
export const EditFailed: Story = {
  args: { view: { ...loaded, post, edit: { values: editValues, errors: {}, saving: false, failure: SAVE_FAILED_TEXT } } },
};
// F3.4: an anonymous post, as its author (the own note, edit and delete) and as anyone else; its edit form has no audience group.
const anonymousPost: PostReadView = { ...post, audience: 'everyone', isAnonymous: true };
export const AnonymousAsAuthor: Story = { args: { view: { ...loaded, post: anonymousPost }, moreActions: ownActions } };
export const AnonymousAsReader: Story = { args: { view: { ...loaded, post: { ...anonymousPost, isMine: false } } } };
export const AnonymousEditing: Story = {
  args: { view: { ...loaded, post: anonymousPost, edit: { values: { ...editValues, audience: 'everyone' }, errors: {}, saving: false, failure: null } } },
};
export const DeleteConfirm: Story = { args: { view: { ...loaded, post, confirm: { saving: false, failure: null } }, moreActions: ownActions } };
export const DeleteFailed: Story = { args: { view: { ...loaded, post, confirm: { saving: false, failure: DELETE_FAILED_TEXT } }, moreActions: ownActions } };
export const Loading: Story = { args: { view: { kind: 'loading' } } };
export const Unavailable: Story = { args: { view: { kind: 'unavailable' } } };
export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };
// F3.5 c12: a share's page: the sharer and their text, the original in a quote with "לפוסט המקורי"; the share actions (c9, F3.6 c3).
const shareView: ShareReadView = {
  kind: 'share',
  id: '9c4d2a61-1f7b-4e83-b5a0-6d8e3f2c1a03',
  body: null,
  sharerText: 'מסכימה לגמרי עם מה שנכתב כאן.',
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-10-18T10:00:00.000Z',
  isAnonymous: false,
  isMine: false,
  author: { name: 'דנה כהן' },
  original: {
    available: true,
    id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01',
    body: 'הטיפ הכי טוב שקיבלתי: לישון כשהתינוק ישן.',
    audience: 'everyone',
    createdAt: '2026-10-17T20:30:00.000Z',
    isAnonymous: false,
    isMine: false,
    author: { name: 'מיכל ברק' },
  },
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
};
export const Share: Story = { args: { view: { ...loaded, post: shareView }, moreActions, onShareInFeed: noop, onShareLink: noop } };
// The sharer's own share: "מחיקת הפוסט" under "⋯" and no edit (c8); the original no longer available (AC-081): no quote, no link, no share action.
export const OwnShareOriginalUnavailable: Story = {
  args: { view: { ...loaded, post: { ...shareView, isMine: true, original: { available: false } } }, moreActions: ownShareActions },
};
export const OwnShareMenuOpen: Story = { args: { view: { ...loaded, post: { ...shareView, isMine: true } }, moreActions: ownShareActions, menuOpen: true } };
// The caller was refused a share (403): the page alert (c11).
export const ShareRefusedAlert: Story = { args: { view: { ...loaded, post: others }, moreActions, onShareInFeed: noop, pageAlert: 'השיתוף לא פורסם. אפשר לנסות שוב' } };
