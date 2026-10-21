// FR-NOTIF-001 (AC-040): the notification list as a reader gets it - the sentence from the type and the actor, the deep link, the unread
// mark. The data and the polling are the provider's (e2e/notifications.spec.ts); the rules of who is notified are the database's.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@nestly/shared';
import { NotificationList } from '@/features/notifications/NotificationList';
import { hrefOf, sentenceOf, unreadBellLabel } from '@/features/notifications/notification-texts';

const ID = '11111111-1111-4111-8111-111111111111';
const base: NotificationItem = { id: ID, type: 'post_comment', actor: 'named', actorName: 'דנה לוי', targetKind: 'post', targetId: ID, createdAt: '2026-10-20T09:00:00.000Z', isRead: false };

describe('[AC-040] the sentence and the link', () => {
  it('[AC-040] each event reads as a sentence with the actor\'s name; no name is "מישהו"; the anonymous author\'s own comment is "המחבר"', () => {
    expect(sentenceOf(base)).toBe('תגובה חדשה של דנה לוי על הפוסט שלך');
    expect(sentenceOf({ ...base, type: 'friend_request' })).toBe('בקשת חברות חדשה מדנה לוי');
    expect(sentenceOf({ ...base, actor: 'hidden', actorName: null })).toBe('תגובה חדשה של מישהו על הפוסט שלך');
    expect(sentenceOf({ ...base, type: 'comment_reply', actor: 'author', actorName: null })).toBe('תשובה חדשה של המחבר לתגובה שלך');
  });

  it("[BR-037 AC-046] a Friend's child's birthday names the parent only: no child's name, age or birth date (Afik 21.10, OP-060)", () => {
    expect(sentenceOf({ ...base, type: 'child_birthday', targetKind: 'user' })).toBe('יום הולדת לילד/ה של דנה לוי');
  });
  it('[AC-040] a post notification links to the post, a person one to the profile; the bell\'s name carries the unread count', () => {
    expect(hrefOf(base)).toBe(`/posts/${ID}`);
    expect(hrefOf({ targetKind: 'user', targetId: ID })).toBe(`/u/${ID}`);
    expect(unreadBellLabel(0)).toBe('התראות');
    expect(unreadBellLabel(3)).toBe('התראות, 3 חדשות');
  });
});

describe('[AC-040] the list', () => {
  it('[AC-040] an unread item says "חדשה" for assistive technology; a read one does not; choosing one tells the caller', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <NotificationList items={[base, { ...base, id: '22222222-2222-4222-8222-222222222222', isRead: true }]} onOpen={onOpen} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByText('חדשה')).toHaveLength(1);
    screen.getAllByRole('link')[0]?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
