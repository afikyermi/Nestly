import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { PostReadView } from '@nestly/shared';
import { PostContent } from './PostContent';
import { DELETE_FAILED_TEXT, LOAD_FAILED_TEXT, PUBLISHED_STATUS, SAVE_FAILED_TEXT } from './posts-texts';

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

export const Published: Story = { args: { view: { ...loaded, post, status: PUBLISHED_STATUS } } };
export const OthersPost: Story = { args: { view: { ...loaded, post: { ...post, isMine: false, stageTag: null, audience: 'everyone' } } } };
export const Editing: Story = {
  args: { view: { ...loaded, post, edit: { values: editValues, errors: {}, saving: false, failure: null } } },
};
export const EditFailed: Story = {
  args: { view: { ...loaded, post, edit: { values: editValues, errors: {}, saving: false, failure: SAVE_FAILED_TEXT } } },
};
// F3.4: an anonymous post, as its author (the own note, edit and delete) and as anyone else; its edit form has no audience group.
const anonymousPost: PostReadView = { ...post, audience: 'everyone', isAnonymous: true };
export const AnonymousAsAuthor: Story = { args: { view: { ...loaded, post: anonymousPost } } };
export const AnonymousAsReader: Story = { args: { view: { ...loaded, post: { ...anonymousPost, isMine: false } } } };
export const AnonymousEditing: Story = {
  args: { view: { ...loaded, post: anonymousPost, edit: { values: { ...editValues, audience: 'everyone' }, errors: {}, saving: false, failure: null } } },
};
export const DeleteConfirm: Story = { args: { view: { ...loaded, post, confirm: { saving: false, failure: null } } } };
export const DeleteFailed: Story = { args: { view: { ...loaded, post, confirm: { saving: false, failure: DELETE_FAILED_TEXT } } } };
export const Loading: Story = { args: { view: { kind: 'loading' } } };
export const Unavailable: Story = { args: { view: { kind: 'unavailable' } } };
export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };
