import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { FeedUnit } from '@nestly/shared';
import { FeedContent } from './FeedContent';
import { PostLinkButton } from './PostLinkButton';
import { FEED_LOAD_FAILED_TEXT } from './feed-texts';

// The feed list and its states (F3.2b), as it sits in the shell's `main`. Links need a router.
function Screen(props: Parameters<typeof FeedContent>[0]) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <FeedContent onToggleLike={() => undefined} actionsFor={() => [{ key: 'hide', label: 'הסתרת הפוסט', onSelect: () => undefined }]} onUndoHide={() => undefined} {...props} />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/posts/FeedContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const unit = (id: string, name: string): FeedUnit => ({
  id,
  kind: 'post',
  source: 'organic',
  body: `פוסט של ${name}`,
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-10-18T09:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  isMine: false,
  isAnonymous: false,
  author: { name },
});
const items = [
  unit('7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', 'נועה לוי'),
  unit('3b2e8f10-6d4a-4c1e-8a57-2c9d1e7f4b02', 'דנה כהן'),
  unit('9c4d2a61-1f7b-4e83-b5a0-6d8e3f2c1a03', 'מיכל ברק'),
];
const ready = { phase: 'ready', loading: false, items, message: '', focusIndex: null, hiddenIds: [], pendingHideIds: [], hideFocus: null } as const;

export const Loading: Story = { args: { state: { ...ready, phase: 'initial', loading: true, items: [] } } };
export const Cards: Story = { args: { state: ready } };
export const LoadingMore: Story = { args: { state: { ...ready, loading: true } } };
export const Empty: Story = {
  args: { state: { ...ready, items: [] }, emptyAction: <PostLinkButton to="/posts/new">כתיבת פוסט</PostLinkButton> },
};
export const FirstPageFailed: Story = { args: { state: { ...ready, phase: 'first-error', items: [], message: FEED_LOAD_FAILED_TEXT } } };
export const LaterPageFailed: Story = { args: { state: { ...ready, phase: 'more-error', message: FEED_LOAD_FAILED_TEXT } } };

// F3.9 c9: the second card was hidden here; its placeholder holds its place with the undo.
export const WithHiddenCard: Story = { args: { state: { ...ready, hiddenIds: [items[1]?.id ?? ''] } } };
// The undo in flight ("מבטלים").
export const UndoPending: Story = { args: { state: { ...ready, hiddenIds: [items[1]?.id ?? ''], pendingHideIds: [items[1]?.id ?? ''] } } };
// F3.9 c13: the delete confirmation of the viewer's own card.
export const DeleteConfirm: Story = { args: { state: ready, confirm: { unitId: items[0]?.id ?? '', saving: false, failure: null } } };
