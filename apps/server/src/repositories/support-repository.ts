// Support (I8; FR-ADMIN-001/002, FR-CHAT-004; migration 20261022100000). Runs inside the caller's identity transaction and nowhere else. Who reads
// a request, who replies, who changes its status and the Audit entry are the database's (the support policies, the author and transition
// triggers, audit_trigger). The staff reads need nestly.staff_view (the admin screens); the user's own reads do not.

import type { SupportDetail, SupportInbox, SupportList, SupportStatus, SupportThread, SupportTopic } from '@nestly/shared';
import { SUPPORT_STATUSES, SUPPORT_TOPICS } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const LIMIT = 200;

/** A new request in the caller's name; a refusal propagates (42501 staff or a stopped account, NS023 the daily limit). */
export async function insertSupportRequest(tx: IdentityTx, topic: SupportTopic, text: string): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`insert into nestly.support_requests (topic, body) values (${topic}, ${text}) returning id`),
  );
  if (row === undefined) throw new Error('the Support request insert returned no row');
  return row.id;
}

/** The caller's own requests, newest first, with its unread Support replies. */
export async function readOwnRequests(tx: IdentityTx): Promise<SupportList['requests']> {
  return z
    .array(z.object({ id: z.guid(), topic: z.enum(SUPPORT_TOPICS), status: z.enum(SUPPORT_STATUSES), createdAt: z.string(), unread: z.number().int() }))
    .parse(
      await tx.execute(sql`
        select s.id, s.topic, s.status, to_char(s.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
               (select count(*)::int from nestly.support_messages m
                 where m.support_request_id = s.id and m.author_kind = 'support'
                   and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r
                                                 where r.user_id = (select auth.uid()) and r.support_request_id = s.id), '-infinity')) as unread
        from nestly.support_requests s
        where s.user_id = (select auth.uid())
        order by s.created_at desc, s.id
        limit ${LIMIT}`),
    );
}

const head = z.object({ id: z.guid(), topic: z.enum(SUPPORT_TOPICS), status: z.enum(SUPPORT_STATUSES), text: z.string(), createdAt: z.string() });

/** One of the caller's own requests and its thread (the user's read shows no internal note), or undefined. */
export async function readOwnThread(tx: IdentityTx, requestId: string): Promise<SupportThread | undefined> {
  const [request] = z.array(head).parse(
    await tx.execute(sql`
      select s.id, s.topic, s.status, s.body as text, to_char(s.created_at at time zone 'UTC', ${isoMs}) as "createdAt"
      from nestly.support_requests s where s.id = ${requestId}::uuid and s.user_id = (select auth.uid())`),
  );
  if (request === undefined) return undefined;
  const messages = z.array(z.object({ id: z.guid(), text: z.string(), at: z.string(), fromSupport: z.boolean() })).parse(
    await tx.execute(sql`
      select m.id, m.body as text, to_char(m.created_at at time zone 'UTC', ${isoMs}) as at, m.author_kind = 'support' as "fromSupport"
      from nestly.support_messages m where m.support_request_id = ${requestId}::uuid
      order by m.created_at, m.id`),
  );
  return { ...request, messages };
}

/** Whether the caller reads the request, and its status. */
export async function readRequestStatus(tx: IdentityTx, requestId: string): Promise<SupportStatus | undefined> {
  const [row] = z.array(z.object({ status: z.enum(SUPPORT_STATUSES) })).parse(
    await tx.execute(sql`select s.status from nestly.support_requests s where s.id = ${requestId}::uuid`),
  );
  return row?.status;
}

/** A message in the thread: the database names its author (user, or Support for a staff caller). A refusal propagates (42501). */
export async function insertSupportMessage(tx: IdentityTx, requestId: string, text: string, internal: boolean): Promise<void> {
  await tx.execute(sql`insert into nestly.support_messages (support_request_id, body, is_internal) values (${requestId}::uuid, ${text}, ${internal})`);
}

/** The Support inbox (FR-ADMIN-002): every request SUPPORT_VIEW reads, newest first, optionally of one status. Needs nestly.staff_view. */
export async function readInbox(tx: IdentityTx, status: SupportStatus | undefined): Promise<SupportInbox['items']> {
  return z
    .array(
      z.object({
        id: z.guid(),
        topic: z.enum(SUPPORT_TOPICS),
        status: z.enum(SUPPORT_STATUSES),
        createdAt: z.string(),
        updatedAt: z.string(),
        userId: z.guid(),
        userName: z.string().nullable(),
        text: z.string(),
      }),
    )
    .parse(
      await tx.execute(sql`
        select s.id, s.topic, s.status, to_char(s.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
               to_char(s.updated_at at time zone 'UTC', ${isoMs}) as "updatedAt", s.user_id as "userId", n.full_name as "userName", s.body as text
        from nestly.support_requests s left join nestly.regular_names n on n.user_id = s.user_id
        where ${status === undefined ? sql`true` : sql`s.status = ${status}`}
        order by s.created_at desc, s.id
        limit ${LIMIT}`),
    );
}

/** One request and its whole thread, internal notes included, as SUPPORT_VIEW reads it. Needs nestly.staff_view. */
export async function readRequestDetail(tx: IdentityTx, requestId: string): Promise<SupportDetail | undefined> {
  const [request] = z.array(head.extend({ userId: z.guid(), userName: z.string().nullable() })).parse(
    await tx.execute(sql`
      select s.id, s.topic, s.status, s.body as text, to_char(s.created_at at time zone 'UTC', ${isoMs}) as "createdAt",
             s.user_id as "userId", n.full_name as "userName"
      from nestly.support_requests s left join nestly.regular_names n on n.user_id = s.user_id
      where s.id = ${requestId}::uuid`),
  );
  if (request === undefined) return undefined;
  const messages = z
    .array(z.object({ id: z.guid(), text: z.string(), at: z.string(), author: z.enum(['user', 'support']), internal: z.boolean() }))
    .parse(
      await tx.execute(sql`
        select m.id, m.body as text, to_char(m.created_at at time zone 'UTC', ${isoMs}) as at, m.author_kind as author, m.is_internal as internal
        from nestly.support_messages m where m.support_request_id = ${requestId}::uuid
        order by m.created_at, m.id`),
    );
  return { ...request, messages };
}

/** Changes a request's status (SUPPORT_HANDLE; audited). Returns the rows changed. A refusal propagates (42501: a closed request). */
export async function updateRequestStatus(tx: IdentityTx, requestId: string, status: SupportStatus): Promise<number> {
  const rows = await tx.execute(sql`update nestly.support_requests set status = ${status} where id = ${requestId}::uuid returning id`);
  return rows.length;
}
