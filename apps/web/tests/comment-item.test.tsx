// I3 F3.3 w1 criteria 15 and 16 (unit), derived from .work/comments-likes/spec.md and screen.md only: who a comment is by, what it shows,
// and which actions it offers. The journeys (paging, composer, delete, likes) are e2e/comments.spec.ts. A comment is drawn from props alone.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommentThreadItem, CommentView } from '@nestly/shared';
import { describe, expect, it, vi } from 'vitest';
import { CommentItem, type CommentMenu } from '@/features/posts/CommentItem';
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

// F3.7 c9: the delete button moved into the comment's "⋯" menu (menu.onDelete), next to "דיווח על התגובה" (menu.onReport); the menu is controlled by openId.
function draw(item: CommentThreadItem, menu: Partial<CommentMenu> = {}) {
  const full: CommentMenu = { openId: null, onOpenChange: vi.fn(), onDelete: vi.fn(), onReport: vi.fn(), ...menu };
  return render(
    <ul>
      <CommentItem item={itemOf(item)} onLike={vi.fn()} onReply={vi.fn()} onMoreReplies={vi.fn()} menu={full} />
    </ul>,
  );
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
  it('[F3.7 c9] every comment and reply has one "פעולות נוספות לתגובה" button, and no visible "מחיקה" button any more', () => {
    draw(thread(1, { isMine: false }, [view(2, { isMine: true }), view(3)]));
    const more = screen.getAllByRole('button', { name: 'פעולות נוספות לתגובה' });
    expect(more).toHaveLength(3);
    for (const button of more) expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.queryByRole('button', { name: 'מחיקה' })).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
  it('[F3.7 c9][c16] my comment\'s menu holds "מחיקה" only, and choosing it deletes that comment', async () => {
    const onDelete = vi.fn();
    const onReport = vi.fn();
    draw(thread(1, { isMine: true }), { openId: ID(1), onDelete, onReport });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['מחיקה']);
    await userEvent.click(items[0] ?? document.body);
    expect(onDelete).toHaveBeenCalledWith(ID(1));
    expect(onReport).not.toHaveBeenCalled();
  });
  it('[F3.7 c9][c16] another person\'s comment\'s menu holds "דיווח על התגובה" only and no delete, even the post author\'s "המחבר"; choosing it reports that comment', async () => {
    const onDelete = vi.fn();
    const onReport = vi.fn();
    draw(thread(1, { byAuthor: true, author: undefined, isMine: false }), { openId: ID(1), onDelete, onReport });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['דיווח על התגובה']);
    await userEvent.click(items[0] ?? document.body);
    expect(onReport).toHaveBeenCalledWith(ID(1));
    expect(onDelete).not.toHaveBeenCalled();
  });
  it('[F3.7 c9] a reply\'s menu follows the same rule: mine deletes, another\'s reports', () => {
    const { unmount } = draw(thread(1, {}, [view(2, { isMine: true })]), { openId: ID(2) });
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['מחיקה']);
    unmount();
    draw(thread(1, { isMine: true }, [view(2)]), { openId: ID(2) });
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['דיווח על התגובה']);
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
