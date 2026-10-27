// Chat (I8; FR-CHAT-001..003, FR-SERV-009; migration 20261022100000). Runs inside the caller's identity transaction and nowhere else. Who reads a
// conversation, who sends, who answers a request and what a block stops are the database's (the chat policies, the transition and limit
// triggers). No statement carries the caller's id as a value: the owner columns default to auth.uid(); `(select auth.uid())` in a `where` picks
// the caller's side of a row it can already read (its own requests, its own markers), never a permission.

import type { ChatMessage, ChatRequestItem, ConversationItem, ConversationThread, SupportThreadItem } from '@nestly/shared';
import { SUPPORT_STATUSES, SUPPORT_TOPICS } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const LIST_LIMIT = 100;
const THREAD_LIMIT = 500;

/** The other party of a conversation row `c`, as SQL. */
const other = sql.raw(`case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end`);

/** A standing Chat Block between the two parties of `c`, either way. */
const chatBlocked = sql.raw(`exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
  and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)))`);

/** The caller's unread messages in `c`: from the other side, after its own read marker. */
const unreadIn = sql.raw(`(select count(*)::int from nestly.messages m
  where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
    and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.conversation_id = c.id), '-infinity'))`);

/** The caller's unread Support replies in `s`. */
const unreadSupport = sql.raw(`(select count(*)::int from nestly.support_messages m
  where m.support_request_id = s.id and m.author_kind = 'support'
    and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity'))`);

const conversationRow = z.object({
  id: z.guid(),
  otherUserId: z.guid(),
  otherName: z.string().nullable(),
  lastText: z.string().nullable(),
  lastAt: z.string().nullable(),
  lastMine: z.boolean().nullable(),
  unread: z.number().int(),
  canSend: z.boolean(),
});

/** The caller's conversations, latest activity first (the opening message counts as the first message of a request's conversation). */
export async function readConversations(tx: IdentityTx): Promise<ConversationItem[]> {
  const rows = z.array(conversationRow).parse(
    await tx.execute(sql`
      select c.id, ${other} as "otherUserId", coalesce(n.full_name, pp.full_name) as "otherName",
             coalesce(lm.body, op.opening_message, oo.opening_message) as "lastText",
             to_char(coalesce(lm.created_at, op.created_at, oo.created_at) at time zone 'UTC', ${isoMs}) as "lastAt",
             coalesce(lm.mine, op.mine, oo.mine) as "lastMine",
             ${unreadIn} as unread, not ${chatBlocked} as "canSend"
      from nestly.conversations c
      left join nestly.regular_names n on n.user_id = ${other}
      left join nestly.professional_profiles pp on pp.user_id = ${other}
      left join lateral (select m.body, m.created_at, m.sender_id = (select auth.uid()) as mine from nestly.messages m
                          where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
      left join lateral (select r.opening_message, r.created_at, r.requester_id = (select auth.uid()) as mine from nestly.chat_requests r
                          where r.id = c.chat_request_id) op on true
      left join lateral (select o.opening_message, o.created_at, o.professional_id = (select auth.uid()) as mine from nestly.outreach_requests o
                          where o.id = c.outreach_request_id) oo on true
      order by coalesce(lm.created_at, op.created_at, oo.created_at, c.created_at) desc, c.id
      limit ${LIST_LIMIT}`),
  );
  return rows.map((row) => ({
    id: row.id,
    otherUserId: row.otherUserId,
    otherName: row.otherName,
    lastMessage: row.lastText === null || row.lastAt === null ? null : { text: row.lastText, at: row.lastAt, mine: row.lastMine ?? false },
    unread: row.unread,
    canSend: row.canSend,
  }));
}

const requestRow = z.object({ id: z.guid(), userId: z.guid(), name: z.string().nullable(), text: z.string(), at: z.string() });

/** Pending requests to the caller (`incoming`) or its own pending requests (`outgoing`), newest first. */
export async function readPendingRequests(tx: IdentityTx, direction: 'incoming' | 'outgoing'): Promise<ChatRequestItem[]> {
  const mine = direction === 'incoming' ? sql`r.target_id` : sql`r.requester_id`;
  const theirs = direction === 'incoming' ? sql`r.requester_id` : sql`r.target_id`;
  return z.array(requestRow).parse(
    await tx.execute(sql`
      select r.id, ${theirs} as "userId", coalesce(n.full_name, pp.full_name) as name, r.opening_message as text, to_char(r.created_at at time zone 'UTC', ${isoMs}) as at
      from nestly.chat_requests r left join nestly.regular_names n on n.user_id = ${theirs}
      left join nestly.professional_profiles pp on pp.user_id = ${theirs}
      where ${mine} = (select auth.uid()) and r.status = 'pending'
      order by r.created_at desc, r.id
      limit ${LIST_LIMIT}`),
  );
}

const supportRow = z.object({
  id: z.guid(),
  topic: z.enum(SUPPORT_TOPICS),
  status: z.enum(SUPPORT_STATUSES),
  lastText: z.string(),
  lastAt: z.string(),
  fromSupport: z.boolean(),
  unread: z.number().int(),
});

/** The caller's Support threads that Support has answered (FR-ADMIN-001: the thread shows in Chat once there is a reply), latest first. */
export async function readSupportThreads(tx: IdentityTx): Promise<SupportThreadItem[]> {
  const rows = z.array(supportRow).parse(
    await tx.execute(sql`
      select s.id, s.topic, s.status, lm.body as "lastText", to_char(lm.created_at at time zone 'UTC', ${isoMs}) as "lastAt",
             lm.author_kind = 'support' as "fromSupport", ${unreadSupport} as unread
      from nestly.support_requests s
      join lateral (select m.body, m.created_at, m.author_kind from nestly.support_messages m
                     where m.support_request_id = s.id order by m.created_at desc, m.id desc limit 1) lm on true
      where s.user_id = (select auth.uid())
        and exists (select 1 from nestly.support_messages m where m.support_request_id = s.id and m.author_kind = 'support')
      order by lm.created_at desc, s.id
      limit ${LIST_LIMIT}`),
  );
  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    status: row.status,
    lastMessage: { text: row.lastText, at: row.lastAt, fromSupport: row.fromSupport },
    unread: row.unread,
  }));
}

/** The badge's number as one scalar expression (FR-CHAT-001): unread messages, unread Support replies, and pending requests to the caller. */
export const chatUnreadSql = sql`((select coalesce(sum(${unreadIn}), 0) from nestly.conversations c)
            + (select coalesce(sum(${unreadSupport}), 0) from nestly.support_requests s where s.user_id = (select auth.uid()))
            + (select count(*) from nestly.chat_requests r where r.target_id = (select auth.uid()) and r.status = 'pending'))::int`;

/** The badge (FR-CHAT-001): unread messages, unread Support replies, and pending requests to the caller. */
export async function readUnreadCount(tx: IdentityTx): Promise<number> {
  const rows = z.array(z.object({ count: z.number().int() })).parse(await tx.execute(sql`select ${chatUnreadSql} as count`));
  return rows[0]?.count ?? 0;
}

const threadHead = z.object({
  id: z.guid(),
  otherUserId: z.guid(),
  otherName: z.string().nullable(),
  chatRequestId: z.guid().nullable(),
  outreachRequestId: z.guid().nullable(),
  listingId: z.guid().nullable(),
  listingTitle: z.string().nullable(),
});

/**
 * One conversation the caller can read, oldest message first (the latest THREAD_LIMIT), with the opening message of the request it came from.
 * Undefined when the caller cannot read it (not a party, the other party stopped, or a user block between them).
 */
export async function readThread(tx: IdentityTx, conversationId: string): Promise<ConversationThread | undefined> {
  const [head] = z.array(threadHead).parse(
    await tx.execute(sql`
      select c.id, ${other} as "otherUserId", coalesce(n.full_name, pp.full_name) as "otherName", c.chat_request_id as "chatRequestId",
             c.outreach_request_id as "outreachRequestId", l.id as "listingId", l.title as "listingTitle"
      from nestly.conversations c left join nestly.regular_names n on n.user_id = ${other}
      left join nestly.marketplace_listings l on l.id = c.listing_id
      left join nestly.professional_profiles pp on pp.user_id = ${other}
      where c.id = ${conversationId}::uuid`),
  );
  if (head === undefined) return undefined;
  const blocks = z.array(z.object({ mine: z.boolean() })).parse(
    await tx.execute(sql`
      select b.blocker_id = (select auth.uid()) as mine from nestly.chat_blocks b join nestly.conversations c on c.id = ${conversationId}::uuid
      where b.lifted_at is null and ((b.blocker_id = c.user_a and b.blocked_id = c.user_b) or (b.blocker_id = c.user_b and b.blocked_id = c.user_a))`),
  );
  const messages = z.array(z.object({ id: z.guid(), text: z.string(), at: z.string(), mine: z.boolean() })).parse(
    await tx.execute(sql`
      select x.id, x.body as text, to_char(x.created_at at time zone 'UTC', ${isoMs}) as at, x.mine
      from (select m.id, m.body, m.created_at, m.sender_id = (select auth.uid()) as mine from nestly.messages m
             where m.conversation_id = ${conversationId}::uuid order by m.created_at desc, m.id desc limit ${THREAD_LIMIT}) x
      order by x.created_at, x.id`),
  );
  const thread: ChatMessage[] = messages.map((message) => ({ ...message, isOpening: false }));
  if (head.chatRequestId !== null) {
    const [opening] = z.array(z.object({ id: z.guid(), text: z.string(), at: z.string(), mine: z.boolean() })).parse(
      await tx.execute(sql`
        select r.id, r.opening_message as text, to_char(r.created_at at time zone 'UTC', ${isoMs}) as at, r.requester_id = (select auth.uid()) as mine
        from nestly.chat_requests r where r.id = ${head.chatRequestId}::uuid`),
    );
    if (opening !== undefined && messages.length < THREAD_LIMIT) thread.unshift({ ...opening, isOpening: true });
  }
  // I11 (FR-SERV-006): an accepted Offer Help's first message opens its conversation, as a chat request's does. An Offer Help accepted when the
  // pair already had a conversation (it is reused) shows its first message there too, in time order (I11 follow-ups). Each side reads only what
  // its policies show: the Professional its own requests, the author only those on its own posts (so any it reads from this pair's Professional
  // belongs here). On the Professional's side an Offer Help on an anonymous
  // post shows only in the conversation it opened (outreach_request_id): nothing here ties another conversation to that post's author.
  const openings = z.array(z.object({ id: z.guid(), text: z.string(), at: z.string(), mine: z.boolean() })).parse(
    await tx.execute(sql`
      select o.id, o.opening_message as text, to_char(o.created_at at time zone 'UTC', ${isoMs}) as at, o.professional_id = (select auth.uid()) as mine
      from nestly.outreach_requests o join nestly.conversations c on c.id = ${conversationId}::uuid
      where o.professional_id in (c.user_a, c.user_b)
        and (o.id = c.outreach_request_id
          or (o.status = 'accepted' and (o.professional_id <> (select auth.uid())
            or exists (select 1 from nestly.posts p where p.id = o.post_id and p.author_id in (c.user_a, c.user_b)))))
      order by o.created_at, o.id`),
  );
  if (openings.length > 0) {
    // inside the window the thread shows: everything when it is not full, else only what is not older than its first message
    const first = messages.length < THREAD_LIMIT ? undefined : messages[0]?.at;
    const shown = openings.filter((opening) => first === undefined || opening.at >= first).map((opening) => ({ ...opening, isOpening: true }));
    thread.push(...shown);
    thread.sort((x, y) => (x.at === y.at ? Number(y.isOpening) - Number(x.isOpening) : x.at < y.at ? -1 : 1));
  }
  return {
    id: head.id,
    otherUserId: head.otherUserId,
    otherName: head.otherName,
    canSend: blocks.length === 0,
    blockedByMe: blocks.some((block) => block.mine),
    listing: head.listingId === null || head.listingTitle === null ? null : { id: head.listingId, title: head.listingTitle },
    messages: thread,
  };
}

/** Marks a conversation or a Support thread read for the caller (the database sets the time). */
export async function markRead(tx: IdentityTx, thread: { conversationId: string } | { supportRequestId: string }): Promise<void> {
  if ('conversationId' in thread) {
    await tx.execute(sql`
      insert into nestly.chat_reads (conversation_id) values (${thread.conversationId}::uuid)
      on conflict (user_id, conversation_id) where conversation_id is not null do update set last_read_at = now()
      where nestly.chat_reads.last_read_at < coalesce((select max(m.created_at) from nestly.messages m where m.conversation_id = ${thread.conversationId}::uuid), '-infinity')`);
  } else {
    await tx.execute(sql`
      insert into nestly.chat_reads (support_request_id) values (${thread.supportRequestId}::uuid)
      on conflict (user_id, support_request_id) where support_request_id is not null do update set last_read_at = now()
      where nestly.chat_reads.last_read_at < coalesce((select max(m.created_at) from nestly.support_messages m where m.support_request_id = ${thread.supportRequestId}::uuid), '-infinity')`);
  }
}

/** Whether the caller can read the conversation. */
export async function canReadConversation(tx: IdentityTx, conversationId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from nestly.conversations c where c.id = ${conversationId}::uuid`);
  return rows.length > 0;
}

/** Sends one message; a refusal propagates with its SQLSTATE (42501: not a party, or a Chat Block). */
export async function insertMessage(tx: IdentityTx, conversationId: string, text: string): Promise<{ id: string; at: string }> {
  const [row] = z.array(z.object({ id: z.guid(), at: z.string() })).parse(
    await tx.execute(sql`
      insert into nestly.messages (conversation_id, body) values (${conversationId}::uuid, ${text})
      returning id, to_char(created_at at time zone 'UTC', ${isoMs}) as at`),
  );
  if (row === undefined) throw new Error('the message insert returned no row');
  return row;
}

/** The caller's conversation with the account, if it can read one. */
export async function findConversationWith(tx: IdentityTx, userId: string): Promise<string | undefined> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      select c.id from nestly.conversations c
      where c.user_a = least((select auth.uid()), ${userId}::uuid) and c.user_b = greatest((select auth.uid()), ${userId}::uuid)`),
  );
  return row?.id;
}

/** Whether the caller and the account are Friends now (an accepted Friendship it can read). */
export async function areFriends(tx: IdentityTx, userId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    select 1 from nestly.friendships f where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = ${userId}::uuid) or (f.addressee_id = (select auth.uid()) and f.requester_id = ${userId}::uuid))`);
  return rows.length > 0;
}

/**
 * Opens the pair's conversation (Friends, or from an accepted request). A conversation another call opened meanwhile (23505 on the pair key, in
 * a savepoint) is that one. Any other refusal propagates.
 */
export async function openConversation(tx: IdentityTx, userId: string, chatRequestId: string | null): Promise<string> {
  try {
    return await tx.transaction(async (savepoint) => {
      const [row] = z.array(z.object({ id: z.guid() })).parse(
        await savepoint.execute(sql`
          insert into nestly.conversations (context, user_a, user_b, chat_request_id)
          values (${chatRequestId === null ? 'friends' : 'request'}, least((select auth.uid()), ${userId}::uuid), greatest((select auth.uid()), ${userId}::uuid),
                  ${chatRequestId}::uuid)
          returning id`),
      );
      if (row === undefined) throw new Error('the conversation insert returned no row');
      return row.id;
    });
  } catch (error) {
    if (readDatabaseFault(error)?.code !== '23505') throw error;
    const existing = await findConversationWith(tx, userId);
    if (existing === undefined) throw error;
    return existing;
  }
}

/** A chat request to a Regular account (I8: Regular to Regular); a refusal propagates with its SQLSTATE. */
export async function insertChatRequest(tx: IdentityTx, userId: string, text: string): Promise<void> {
  await tx.execute(sql`insert into nestly.chat_requests (target_id, target_account_type, opening_message) values (${userId}::uuid, 'regular', ${text})`);
}

/** The target accepts its pending request; returns the requester, or undefined when there is no such pending request to the caller. */
export async function acceptRequest(tx: IdentityTx, requestId: string): Promise<string | undefined> {
  const [row] = z.array(z.object({ requesterId: z.guid() })).parse(
    await tx.execute(sql`
      update nestly.chat_requests set status = 'accepted'
      where id = ${requestId}::uuid and status = 'pending' and target_id = (select auth.uid())
      returning requester_id as "requesterId"`),
  );
  return row?.requesterId;
}

/** The target declines, or the requester cancels, its pending request. Returns the rows changed (0: none such). */
export async function closeRequest(tx: IdentityTx, requestId: string, as: 'target' | 'requester'): Promise<number> {
  const rows =
    as === 'target'
      ? await tx.execute(sql`update nestly.chat_requests set status = 'declined' where id = ${requestId}::uuid and status = 'pending' and target_id = (select auth.uid()) returning id`)
      : await tx.execute(sql`update nestly.chat_requests set status = 'cancelled' where id = ${requestId}::uuid and status = 'pending' and requester_id = (select auth.uid()) returning id`);
  return rows.length;
}

/**
 * Chat-blocks the account (FR-SERV-009). The composite foreign key accepts only a Regular or Professional account, so the type is tried as Regular
 * and then as Professional, each in a savepoint. A standing block is the same answer (idempotent). Other refusals propagate (NS025 the limit).
 */
export async function insertChatBlock(tx: IdentityTx, userId: string): Promise<void> {
  const standing = await tx.execute(sql`select 1 from nestly.chat_blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = ${userId}::uuid and b.lifted_at is null`);
  if (standing.length > 0) return;
  // A block another call put in force meanwhile (23505 on the standing-pair key) is the same answer.
  const attempt = async (type: 'regular' | 'professional'): Promise<'done' | 'wrong_type'> => {
    try {
      await tx.transaction(async (savepoint) => {
        await savepoint.execute(sql`insert into nestly.chat_blocks (blocked_id, blocked_account_type) values (${userId}::uuid, ${type})`);
      });
      return 'done';
    } catch (error) {
      const code = readDatabaseFault(error)?.code;
      if (code === '23505') return 'done';
      if (code === '23503' && type === 'regular') return 'wrong_type';
      throw error;
    }
  };
  if ((await attempt('regular')) === 'wrong_type') await attempt('professional');
}

/** Lifts the caller's standing Chat Block of the account (only the blocker can; zero rows is fine). */
export async function liftChatBlock(tx: IdentityTx, userId: string): Promise<void> {
  await tx.execute(sql`update nestly.chat_blocks set lifted_at = now() where blocked_id = ${userId}::uuid and lifted_at is null`);
}
