import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CATEGORY_OF,
  NOTIFICATION_TYPES,
  checkCategoryUpdate,
  checkFriendFollowBody,
  checkSearchQuery,
  detectTopics,
  normalizeSearchText,
  notificationsResponse,
} from '../src/index.js';

// FR-NOTIF-001/002, FR-SEARCH-001, VAL-037, FR-ALG-008: the shared checks of notifications and search.
const ID = '11111111-1111-4111-8111-111111111111';

describe('[FR-NOTIF-002 AC-041] notification preferences', () => {
  it('[AC-041] every event belongs to one of the five switchable categories (I10 adds groups); there is no security category to switch', () => {
    for (const type of NOTIFICATION_TYPES) expect(['friends', 'comments', 'shares', 'friend_posts', 'groups']).toContain(NOTIFICATION_CATEGORY_OF[type]);
    expect(checkCategoryUpdate('security', { isEnabled: false }).ok).toBe(false);
    expect(checkCategoryUpdate('comments', { isEnabled: false })).toEqual({ ok: true, value: { category: 'comments', isEnabled: false } });
  });

  it('[AC-041] a body is exactly { isEnabled: boolean }', () => {
    for (const bad of [{}, { isEnabled: 'no' }, { isEnabled: true, extra: 1 }, null, 'x']) {
      expect(checkCategoryUpdate('comments', bad).ok, JSON.stringify(bad)).toBe(false);
      expect(checkFriendFollowBody(bad).ok).toBe(false);
    }
    expect(checkFriendFollowBody({ isEnabled: true })).toEqual({ ok: true, value: true });
  });

  it('[AC-040] the list response is strict: no unknown field, no text', () => {
    const item = { id: ID, type: 'post_comment', actor: 'named', actorName: 'דנה', targetKind: 'post', targetId: ID, createdAt: '2026-10-20T09:00:00.000Z', isRead: false };
    expect(notificationsResponse.safeParse({ items: [item], unreadCount: 1, nextCursor: null }).success).toBe(true);
    expect(notificationsResponse.safeParse({ items: [{ ...item, body: 'text' }], unreadCount: 1, nextCursor: null }).success).toBe(false);
  });
});

describe('[VAL-037 AC-078] the search text', () => {
  it('[VAL-037] white space is folded and trimmed; under two or over 100 characters is no query; another key is refused', () => {
    expect(normalizeSearchText('  דנה   לוי ')).toBe('דנה לוי');
    expect(checkSearchQuery({ q: '  דנה   לוי ' })).toEqual({ ok: true, text: 'דנה לוי', type: 'all' });
    for (const bad of [{}, { q: '' }, { q: ' a ' }, { q: 'a'.repeat(101) }, { q: 'ab', x: 1 }, { q: 'ab', type: 'users' }, { q: ['ab'] }]) {
      expect(checkSearchQuery(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(checkSearchQuery({ q: 'א'.repeat(100), type: 'people' }).ok).toBe(true);
  });
});

describe('[FR-ALG-008] topic detection (the Intent Signal)', () => {
  it('maps words to topics by fixed rules and keeps no text', () => {
    expect(detectTopics('יועצת שינה לתינוק')).toContain('sleep');
    expect(detectTopics('עגלה לתינוק')).toContain('baby_gear');
    expect(detectTopics('Fertility clinic')).toContain('fertility');
    expect(detectTopics('דנה לוי')).toEqual([]);
  });

  it('[FR-ALG-008] a rule starts a word (Hebrew prefixes allowed) and a non-stem ends one: no topic inside another word', () => {
    expect(detectTopics('בתחום העבודה שלי')).toEqual([]);
    expect(detectTopics('display settings')).toEqual([]);
    expect(detectTopics('happy birthday')).toEqual([]);
    expect(detectTopics('מחזור פלסטיק')).toEqual([]);
    expect(detectTopics('והשינה של הקטנה')).toContain('sleep');
    expect(detectTopics('הריונות קודמים')).toContain('pregnancy');
    expect(detectTopics('giving birth at home')).toContain('birth');
    expect(detectTopics('חום גבוה בלילה')).toContain('baby_health');
  });
});
