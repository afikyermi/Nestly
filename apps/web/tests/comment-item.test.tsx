// I3 F3.3 w1 criteria 15 and 16 (unit), derived from .work/comments-likes/spec.md and screen.md only: who a comment is by, what it shows,
// and which actions it offers. The journeys (paging, composer, delete, likes) are e2e/comments.spec.ts. A comment is drawn from props alone.
import { render, screen, within } from '@testing-library/react';
import type { CommentThreadItem, CommentView } from '@nestly/shared';
import { describe, expect, it, vi } from 'vitest';
import { CommentItem } from '@/features/posts/CommentItem';
import { itemOf } from '@/features/posts/comments-state';

const ID = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const view = (n: number, extra: Partial<CommentView> = {}): CommentView => ({
  id: ID(n),
  parentId: null,
  body: `גוף ${n}`,
  createdAt: '2026-06-15T09:00:00.000Z',
  isMine: false,
  byAuthor: false,
  author: { name: null },
  likeCount: 0,
  likedByMe: false,
  ...extra,
});
const thread = (n: number, extra: Partial<CommentView> = {}, replies: CommentView[] = [], replyCount = replies.length): CommentThreadItem => ({ ...view(n, extra), replies, replyCount });

function draw(item: CommentThreadItem) {
  return render(<ul><CommentItem item={itemOf(item)} onLike={vi.fn()} onDelete={vi.fn()} onReply={vi.fn()} onMoreReplies={vi.fn()} /></ul>);
}

describe('F3.3 c15 [FR-FEED-001] the name rule', () => {
  it.each([
    ['a name the server sent', { author: { name: 'נועה' } }, 'נועה'],
    ['a null name', { author: { name: null } }, 'מהקהילה'],
    ['the author of a named post (byAuthor with author)', { byAuthor: true, author: { name: 'דנה' } }, 'דנה'],
    ['the author of an anonymous post (byAuthor, no author)', { byAuthor: true, author: undefined }, 'המחבר'],
  ] as const)('[c15][c16] %s: the comment is named %s', (_label, extra, expected) => {
    draw(thread(1, extra));
    expect(screen.getByRole('listitem', { name: expected })).toBeTruthy();
  });
  it('[c15] a reply is named by the same rule', () => {
    draw(thread(1, { author: { name: 'נועה' } }, [view(2, { author: { name: 'יעל' } }), view(3, { byAuthor: true, author: undefined })]));
    expect(screen.getByRole('listitem', { name: 'יעל' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'המחבר' })).toBeTruthy();
  });
});

describe('F3.3 c16 [AC-076, VAL-036] "המחבר"', () => {
  it('[c16] draws no name, avatar or link, and nothing of another label', () => {
    draw(thread(1, { byAuthor: true, author: undefined }));
    const own = screen.getByRole('listitem', { name: 'המחבר' });
    expect(within(own).queryByRole('img')).toBeNull();
    expect(within(own).queryByRole('link')).toBeNull();
    expect(own.querySelector('img, svg image, a')).toBeNull();
    expect(own.outerHTML).not.toContain('מהקהילה');
    expect(own.outerHTML).not.toMatch(/author|avatar/i);
  });
});

describe('F3.3 c15/c16 the actions a comment offers', () => {
  it('[c16] "מחיקה" shows only for isMine', () => {
    draw(thread(1, { isMine: false }, [view(2, { isMine: true }), view(3)]));
    expect(screen.getAllByRole('button', { name: 'מחיקה' })).toHaveLength(1);
  });
  it('[c16] a comment of someone else has no delete, even the post author\'s "המחבר"', () => {
    draw(thread(1, { byAuthor: true, author: undefined, isMine: false }));
    expect(screen.queryByRole('button', { name: 'מחיקה' })).toBeNull();
  });
  it('[c15] "השבה" is on the top-level comment only', () => {
    draw(thread(1, {}, [view(2), view(3)]));
    expect(screen.getAllByRole('button', { name: 'השבה' })).toHaveLength(1);
    const nested = screen.getByRole('list', { name: 'השבות' });
    expect(within(nested).queryByRole('button', { name: 'השבה' })).toBeNull();
  });
  it('[c15] every comment and reply has its like, with "לייק, N" from 1', () => {
    draw(thread(1, { likeCount: 2 }, [view(2)]));
    expect(screen.getByRole('button', { name: 'לייק, 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'לייק' })).toBeTruthy();
  });
  it('[c15] "הצגת עוד השבות" shows only while replyCount exceeds the loaded replies', () => {
    const { unmount } = draw(thread(1, {}, [view(2)], 5));
    expect(screen.getByRole('button', { name: 'הצגת עוד השבות' })).toBeTruthy();
    unmount();
    draw(thread(1, {}, [view(2)], 1));
    expect(screen.queryByRole('button', { name: 'הצגת עוד השבות' })).toBeNull();
  });
});

describe('F3.3 c15 the body is plain text', () => {
  it('[c15] dir=auto, a <script> is text, the text keeps its line breaks', () => {
    const body = 'שורה\nשניה <script>x</script>';
    const { container } = draw(thread(1, { body }));
    const para = container.querySelector('p[dir="auto"]');
    expect(para?.textContent).toBe(body);
    expect(container.querySelector('script')).toBeNull();
  });
  it('[c15] the time is a <time datetime> and not a link', () => {
    const { container } = draw(thread(1));
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-06-15T09:00:00.000Z');
    expect(container.querySelector('time a, a time')).toBeNull();
  });
});
