// Notifications and their preferences (FR-NOTIF-001/002/003). The caller is already authenticated; each call is one identity transaction.
// The database decides what the caller reads and writes (RLS); this layer names the outcome and joins the actor's name where the database shows it.

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATIONS_PAGE_SIZE,
  type FriendFollow,
  type NotificationItem,
  type NotificationPreference,
} from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import { readListedRows, readVisibleNames } from '../repositories/friends-repository.js';
import {
  countUnread,
  markAllRead,
  markOneRead,
  readCategoryRows,
  readFollowRows,
  readLatest,
  writeCategory,
  writeFollow,
} from '../repositories/notifications-repository.js';
import { classifyMember, isRefusal, type MemberRefusal } from './membership.js';

export type NotificationsOutcome =
  | { readonly kind: 'ok'; readonly items: NotificationItem[]; readonly unreadCount: number }
  | MemberRefusal;

/** The bell and the list: the latest notifications and the unread count. A name the database does not show is `null`. */
export async function readNotifications(database: Database, identity: Identity): Promise<NotificationsOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<NotificationsOutcome> => {
    const member = await classifyMember(tx);
    if (isRefusal(member)) return member as MemberRefusal;
    const rows = await readLatest(tx, NOTIFICATIONS_PAGE_SIZE);
    const unreadCount = await countUnread(tx);
    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId === null ? [] : [row.actorId])))];
    const names = new Map((await readVisibleNames(tx, actorIds)).map((name) => [name.userId, name.fullName]));
    const items = rows.map(
      (row): NotificationItem => ({
        id: row.id,
        type: row.type,
        actorId: row.actorId,
        actorName: row.actorId === null ? null : (names.get(row.actorId) ?? null),
        targetKind: row.targetKind,
        targetId: row.targetId,
        createdAt: row.createdAt.toISOString(),
        isRead: row.isRead,
      }),
    );
    return { kind: 'ok', items, unreadCount };
  });
}

export type MarkOutcome = { readonly kind: 'done' } | { readonly kind: 'unavailable' } | MemberRefusal;

/** One notification marked read; `unavailable` when it is not the caller's. */
export async function markRead(database: Database, identity: Identity, id: string): Promise<MarkOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<MarkOutcome> => {
    const member = await classifyMember(tx);
    if (isRefusal(member)) return member as MemberRefusal;
    return (await markOneRead(tx, id)).length === 0 ? { kind: 'unavailable' } : { kind: 'done' };
  });
}

/** AC-040: Mark all as read. */
export async function markEverythingRead(database: Database, identity: Identity): Promise<MarkOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<MarkOutcome> => {
    const member = await classifyMember(tx);
    if (isRefusal(member)) return member as MemberRefusal;
    await markAllRead(tx);
    return { kind: 'done' };
  });
}

export type PreferencesOutcome =
  | { readonly kind: 'ok'; readonly categories: NotificationPreference[]; readonly friends: FriendFollow[] }
  | MemberRefusal;

/** FR-NOTIF-002: each category (on unless switched off), and, for a Regular user, each Friend with whether their new posts notify. */
export async function readPreferences(database: Database, identity: Identity): Promise<PreferencesOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<PreferencesOutcome> => {
    const member = await classifyMember(tx);
    if (isRefusal(member)) return member as MemberRefusal;
    const stored = new Map((await readCategoryRows(tx)).map((row) => [row.category, row.isEnabled]));
    const categories = NOTIFICATION_CATEGORIES.map((category): NotificationPreference => ({ category, isEnabled: stored.get(category) ?? true }));
    if (member.kind !== 'regular') return { kind: 'ok', categories: categories.filter((c) => c.category !== 'friends' && c.category !== 'friend_posts'), friends: [] };
    const me = identity.userId.toLowerCase();
    const friendIds = (await readListedRows(tx)).filter((row) => row.status === 'accepted').map((row) => (row.requesterId === me ? row.addresseeId : row.requesterId));
    const names = new Map((await readVisibleNames(tx, friendIds)).map((name) => [name.userId, name.fullName]));
    const follows = new Map((await readFollowRows(tx)).map((row) => [row.friendId, row.isEnabled]));
    const friends = friendIds
      .flatMap((userId) => {
        const fullName = names.get(userId);
        return fullName === undefined ? [] : [{ userId, fullName, isEnabled: follows.get(userId) ?? false } satisfies FriendFollow];
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.userId.localeCompare(b.userId));
    return { kind: 'ok', categories, friends };
  });
}

export type WriteOutcome = { readonly kind: 'done' } | { readonly kind: 'unavailable' } | MemberRefusal;

export async function setCategory(database: Database, identity: Identity, category: (typeof NOTIFICATION_CATEGORIES)[number], isEnabled: boolean): Promise<WriteOutcome> {
  return inIdentityTransaction(database, identity, async (tx): Promise<WriteOutcome> => {
    const member = await classifyMember(tx);
    if (isRefusal(member)) return member as MemberRefusal;
    await writeCategory(tx, category, isEnabled);
    return { kind: 'done' };
  });
}

/** FR-NOTIF-003: follow or stop following a Friend's new posts. `unavailable` when the person is not an accepted Friend (the policy refuses). */
export async function setFriendFollow(database: Database, identity: Identity, friendId: string, isEnabled: boolean): Promise<WriteOutcome> {
  try {
    return await inIdentityTransaction(database, identity, async (tx): Promise<WriteOutcome> => {
      const member = await classifyMember(tx);
      if (isRefusal(member)) return member as MemberRefusal;
      if (member.kind !== 'regular') return { kind: 'forbidden' };
      await writeFollow(tx, friendId, isEnabled);
      return { kind: 'done' };
    });
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === '42501' || code === '23503' || code === '23514') return { kind: 'unavailable' };
    throw error;
  }
}
