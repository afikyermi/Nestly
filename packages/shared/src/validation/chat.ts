// Chat and Support (I8; FR-CHAT-001..004, FR-ADMIN-001/002, FR-SERV-009; Afik's decisions of 20.10.2026, decisions-in-force §9). The web checks what
// it sends and the server checks again, by the same rules. Every body is strict; no body names the caller (the database binds the sender,
// requester, blocker and Support author to the token's user) and nothing here decides who may do what (RLS does).
import { z } from 'zod';
import { CHAT_TEXT_MAX, SUPPORT_STATUSES, SUPPORT_TOPICS } from '../constants/index.js';
import { targetUser } from './admin.js';
import { codePointLength } from './text.js';

/** What is wrong with a chat or Support text, by the rule the server applies to the trimmed text. */
export function chatTextProblem(text: string): 'empty' | 'long' | 'invalid' | null {
  const value = text.trim();
  if (value === '') return 'empty';
  if (value.includes('\u0000')) return 'invalid';
  return codePointLength(value) > CHAT_TEXT_MAX ? 'long' : null;
}

/** Trimmed; not blank; no NUL; at most CHAT_TEXT_MAX code points (the database's body checks). */
const chatText = z
  .string()
  .refine((value) => chatTextProblem(value) === null, 'invalid')
  .transform((value) => value.trim());

const uuid = z.guid().transform((value) => value.toLowerCase());

/** A uuid in a path: `guid`, so Postgres' cast cannot fail; else 400 before any query. */
export const chatIdParams = z.object({ id: uuid });

/** POST /api/chat/start: write to an account. A conversation goes on; Friends open one; anyone else gets a chat request (FR-CHAT-002). */
export const chatStartSchema = z.strictObject({ userId: uuid, text: chatText });
export type ChatStartRequest = z.infer<typeof chatStartSchema>;

/** POST /api/chat/conversations/:id/messages and POST /api/support/:id/messages: one text. */
export const chatMessageSchema = z.strictObject({ text: chatText });

/** POST /api/support: a topic from the list and a text (FR-ADMIN-001). */
export const supportRequestSchema = z.strictObject({ topic: z.enum(SUPPORT_TOPICS), text: chatText });
export type SupportRequestWrite = z.infer<typeof supportRequestSchema>;

/** POST /api/admin/support/:id/messages: a reply in the name of Support, or an internal note (FR-ADMIN-002). */
export const supportStaffMessageSchema = z.strictObject({ text: chatText, internal: z.boolean() });

/** POST /api/admin/support/:id/status. */
export const supportStatusSchema = z.strictObject({ status: z.enum(SUPPORT_STATUSES) });

/** GET /api/admin/support?status=: one status, or every request when absent. */
export const supportInboxQuery = z.strictObject({ status: z.enum(SUPPORT_STATUSES).optional() });

/** POST /api/admin/reports/message: open a reported message (audited, §9.6). */
export const reportedMessageSchema = z.strictObject({ messageId: uuid });

/**
 * What a refused chat call answers: 400 `invalid`, 404 `unavailable` (no such account, conversation or request the caller can see),
 * 403 `not_allowed` (the caller may not: a Chat Block on a request, a staff account, a Professional before I11), 403 `blocked` (a Chat Block
 * stands in this conversation: no side sends, §9.4), 409 `request_pending` (a request between the two waits for an answer), 409 `closed`
 * (a closed Support request), 429 `rate_limited` (the daily limit).
 */
export const CHAT_ERROR_CODES = ['invalid', 'unavailable', 'not_allowed', 'blocked', 'request_pending', 'closed', 'rate_limited'] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];
export const chatErrorBody = z.object({ error: z.enum(CHAT_ERROR_CODES) });

// ---- answers, as the web reads them ------------------------------------------------------------------------------------------

const lastMessage = z.object({ text: z.string(), at: z.string(), mine: z.boolean() });

/** One conversation in the Chat Center: the other party (name null when it has none), the latest message, the caller's unread count. */
export const conversationItem = z.object({
  id: z.guid(),
  otherUserId: z.guid(),
  otherName: z.string().nullable(),
  lastMessage: lastMessage.nullable(),
  unread: z.number().int(),
  canSend: z.boolean(),
});
export type ConversationItem = z.infer<typeof conversationItem>;

/** A pending chat request: incoming (from) or the caller's own (to). */
export const chatRequestItem = z.object({ id: z.guid(), userId: z.guid(), name: z.string().nullable(), text: z.string(), at: z.string() });
export type ChatRequestItem = z.infer<typeof chatRequestItem>;

/** A Support thread in the Chat Center (it shows once Support has answered, FR-ADMIN-001). */
export const supportThreadItem = z.object({
  id: z.guid(),
  topic: z.enum(SUPPORT_TOPICS),
  status: z.enum(SUPPORT_STATUSES),
  lastMessage: z.object({ text: z.string(), at: z.string(), fromSupport: z.boolean() }).nullable(),
  unread: z.number().int(),
});
export type SupportThreadItem = z.infer<typeof supportThreadItem>;

/** GET /api/chat: the Chat Center (FR-CHAT-001). `unreadTotal` is the badge: unread messages and Support replies, and incoming requests. */
export const chatOverviewBody = z.object({
  conversations: z.array(conversationItem),
  incoming: z.array(chatRequestItem),
  outgoing: z.array(chatRequestItem),
  support: z.array(supportThreadItem),
  unreadTotal: z.number().int(),
});
export type ChatOverview = z.infer<typeof chatOverviewBody>;

/** GET /api/chat/unread: the badge alone. */
export const chatUnreadBody = z.object({ count: z.number().int() });

export const chatMessage = z.object({ id: z.guid(), text: z.string(), at: z.string(), mine: z.boolean(), isOpening: z.boolean() });
export type ChatMessage = z.infer<typeof chatMessage>;

/**
 * GET /api/chat/conversations/:id: the thread, oldest first (the opening message of an accepted request first). `canSend` false while a Chat
 * Block stands either way; `blockedByMe` tells the blocker it can lift it. No read receipt: nothing here says what the other side read (§9.5).
 */
export const conversationBody = z.object({
  id: z.guid(),
  otherUserId: z.guid(),
  otherName: z.string().nullable(),
  canSend: z.boolean(),
  blockedByMe: z.boolean(),
  /** I12 (FR-MKT-005): the listing a Marketplace conversation was opened from, while the reader can still read it; else null. */
  listing: z.object({ id: z.guid(), title: z.string() }).nullable().optional(),
  messages: z.array(chatMessage),
});
export type ConversationThread = z.infer<typeof conversationBody>;

/** POST /api/chat/start: where the text went. */
export const chatStartBody = z.union([
  z.strictObject({ kind: z.literal('conversation'), conversationId: z.guid() }),
  z.strictObject({ kind: z.literal('request') }),
]);
export type ChatStartResult = z.infer<typeof chatStartBody>;

/** POST /api/chat/requests/:id/accept: the conversation the accept opened. */
export const chatAcceptBody = z.object({ conversationId: z.guid() });

export const supportMessage = z.object({ id: z.guid(), text: z.string(), at: z.string(), fromSupport: z.boolean() });

/** GET /api/support/:id: the caller's own request and its thread, without internal notes. */
export const supportThreadBody = z.object({
  id: z.guid(),
  topic: z.enum(SUPPORT_TOPICS),
  status: z.enum(SUPPORT_STATUSES),
  text: z.string(),
  createdAt: z.string(),
  messages: z.array(supportMessage),
});
export type SupportThread = z.infer<typeof supportThreadBody>;

/** GET /api/support: the caller's requests, newest first. */
export const supportListBody = z.object({
  requests: z.array(z.object({ id: z.guid(), topic: z.enum(SUPPORT_TOPICS), status: z.enum(SUPPORT_STATUSES), createdAt: z.string(), unread: z.number().int() })),
});
export type SupportList = z.infer<typeof supportListBody>;

/** POST /api/support (201). */
export const supportCreatedBody = z.object({ id: z.guid() });

/** GET /api/admin/support: the Support inbox (FR-ADMIN-002), newest first. */
export const supportInboxBody = z.object({
  items: z.array(
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
  ),
});
export type SupportInbox = z.infer<typeof supportInboxBody>;

/** GET /api/admin/support/:id: one request with its whole thread, internal notes included. */
export const supportDetailBody = z.object({
  id: z.guid(),
  topic: z.enum(SUPPORT_TOPICS),
  status: z.enum(SUPPORT_STATUSES),
  text: z.string(),
  createdAt: z.string(),
  userId: z.guid(),
  userName: z.string().nullable(),
  messages: z.array(z.object({ id: z.guid(), text: z.string(), at: z.string(), author: z.enum(['user', 'support']), internal: z.boolean() })),
});
export type SupportDetail = z.infer<typeof supportDetailBody>;

/** POST /api/admin/reports/message: the reported message, its sender, and the sender's account for USER_VIEW (else null). */
export const reportedMessageBodySchema = z.object({ text: z.string(), sentAt: z.string(), senderId: z.guid(), user: targetUser.nullable() });
export type ReportedMessage = z.infer<typeof reportedMessageBodySchema>;
