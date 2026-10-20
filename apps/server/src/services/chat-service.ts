// Chat (I8; FR-CHAT-001..003, FR-SERV-009, BR-036, BR-042; Afik's decisions of 20.10.2026, §9). The caller is already authenticated; each call is
// one identity transaction. The database decides who reads and writes what; this layer picks the path of a first message (FR-CHAT-002: a
// conversation goes on, Friends open one, anyone else gets a chat request) and names a database refusal by its SQLSTATE:
// 42501 not allowed (or a Chat Block in a conversation), 23503 no such account, 23505 a live request between the two, NS022/NS025 the daily
// limits. Message text never reaches a log line, an event or any other table (BR-052, AC-067).

import type { ChatOverview, ChatStartResult, ConversationThread } from '@nestly/shared';
import type { Database } from '../db/client.js';
import { inIdentityTransaction } from '../db/identity-transaction.js';
import { readDatabaseFault } from '../lib/pg-error.js';
import type { Identity } from '../lib/token-verifier.js';
import {
  acceptRequest,
  areFriends,
  canReadConversation,
  closeRequest,
  findConversationWith,
  insertChatBlock,
  insertChatRequest,
  insertMessage,
  liftChatBlock,
  markRead,
  openConversation,
  readConversations,
  readPendingRequests,
  readSupportThreads,
  readThread,
  readUnreadCount,
} from '../repositories/chat-repository.js';

export type ChatRefusal =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not_allowed' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'request_pending' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'rate_limited' };
export type ChatOutcome<T> = ({ readonly kind: 'ok' } & T) | ChatRefusal;

/** A database refusal by SQLSTATE; undefined for anything else (a fault, rethrown). */
function refusalOf(error: unknown): ChatRefusal | undefined {
  switch (readDatabaseFault(error)?.code) {
    case '42501':
      return { kind: 'not_allowed' };
    case '23503':
      return { kind: 'unavailable' };
    case '23505':
      return { kind: 'request_pending' };
    case '23514':
      return { kind: 'invalid' };
    case 'NS022':
    case 'NS023':
    case 'NS025':
      return { kind: 'rate_limited' };
    default:
      return undefined;
  }
}

async function guarded<T>(work: () => Promise<ChatOutcome<T>>): Promise<ChatOutcome<T>> {
  try {
    return await work();
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal === undefined) throw error;
    return refusal;
  }
}

/** GET /api/chat: the Chat Center. */
export async function readOverview(database: Database, identity: Identity): Promise<ChatOverview> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const conversations = await readConversations(tx);
    const incoming = await readPendingRequests(tx, 'incoming');
    const outgoing = await readPendingRequests(tx, 'outgoing');
    const support = await readSupportThreads(tx);
    const unreadTotal =
      conversations.reduce((sum, item) => sum + item.unread, 0) + support.reduce((sum, item) => sum + item.unread, 0) + incoming.length;
    return { conversations, incoming, outgoing, support, unreadTotal };
  });
}

/** GET /api/chat/unread: the badge. */
export async function readUnread(database: Database, identity: Identity): Promise<number> {
  return inIdentityTransaction(database, identity, (tx) => readUnreadCount(tx));
}

/** GET /api/chat/conversations/:id: the thread; opening it marks it read. */
export async function openThread(database: Database, identity: Identity, conversationId: string): Promise<ChatOutcome<{ thread: ConversationThread }>> {
  return inIdentityTransaction(database, identity, async (tx) => {
    const thread = await readThread(tx, conversationId);
    if (thread === undefined) return { kind: 'unavailable' };
    await markRead(tx, { conversationId });
    return { kind: 'ok', thread };
  });
}

/** POST /api/chat/conversations/:id/messages. A refusal in a conversation the caller reads is a Chat Block (§9.4). */
export async function sendMessage(database: Database, identity: Identity, conversationId: string, text: string): Promise<ChatOutcome<{ id: string; at: string }>> {
  try {
    return await inIdentityTransaction(database, identity, async (tx) => {
      const sent = await insertMessage(tx, conversationId, text);
      await markRead(tx, { conversationId });
      return { kind: 'ok', ...sent };
    });
  } catch (error) {
    const code = readDatabaseFault(error)?.code;
    if (code === '23514') return { kind: 'invalid' };
    if (code !== '42501') throw error;
    const readable = await inIdentityTransaction(database, identity, (tx) => canReadConversation(tx, conversationId));
    return { kind: readable ? 'blocked' : 'unavailable' };
  }
}

/**
 * POST /api/chat/start (FR-CHAT-002): a conversation with the account goes on; Friends open one; anyone else gets a chat request with this text as
 * its opening message (FR-CHAT-003). In a conversation, a refusal is a Chat Block.
 */
export async function startChat(database: Database, identity: Identity, userId: string, text: string): Promise<ChatOutcome<{ result: ChatStartResult }>> {
  if (userId === identity.userId) return { kind: 'invalid' };
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ChatOutcome<{ result: ChatStartResult }>> => {
      const existing = await findConversationWith(tx, userId);
      if (existing === undefined && !(await areFriends(tx, userId))) {
        await insertChatRequest(tx, userId, text);
        return { kind: 'ok', result: { kind: 'request' } };
      }
      // The Friends' new conversation and its first message stand or fall together: a Chat Block refuses the message (42501) and no empty
      // conversation is left behind.
      const conversationId = await tx
        .transaction(async (savepoint) => {
          const id = existing ?? (await openConversation(savepoint, userId, null));
          await insertMessage(savepoint, id, text);
          return id;
        })
        .catch((error: unknown) => {
          if (readDatabaseFault(error)?.code === '42501') return undefined;
          throw error;
        });
      if (conversationId === undefined) return { kind: 'blocked' };
      await markRead(tx, { conversationId });
      return { kind: 'ok', result: { kind: 'conversation', conversationId } };
    }),
  );
}

/** POST /api/chat/requests/:id/accept: the target accepts and the conversation opens in the same transaction. */
export async function acceptChatRequest(database: Database, identity: Identity, requestId: string): Promise<ChatOutcome<{ conversationId: string }>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ChatOutcome<{ conversationId: string }>> => {
      const requesterId = await acceptRequest(tx, requestId);
      if (requesterId === undefined) return { kind: 'unavailable' };
      const conversationId = await openConversation(tx, requesterId, requestId);
      await markRead(tx, { conversationId });
      return { kind: 'ok', conversationId };
    }),
  );
}

/** POST /api/chat/requests/:id/decline (the target; that request only, §9.3) and DELETE /api/chat/requests/:id (the requester cancels). */
export async function endChatRequest(database: Database, identity: Identity, requestId: string, as: 'target' | 'requester'): Promise<ChatOutcome<object>> {
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ChatOutcome<object>> => {
      const changed = await closeRequest(tx, requestId, as);
      return changed === 0 ? { kind: 'unavailable' } : { kind: 'ok' };
    }),
  );
}

/** PUT /api/users/:id/chat-block (a repeat is the same answer) and DELETE (no block is the same answer). */
export async function changeChatBlock(database: Database, identity: Identity, userId: string, block: boolean): Promise<ChatOutcome<object>> {
  if (userId === identity.userId) return { kind: 'invalid' };
  return guarded(() =>
    inIdentityTransaction(database, identity, async (tx): Promise<ChatOutcome<object>> => {
      if (block) await insertChatBlock(tx, userId);
      else await liftChatBlock(tx, userId);
      return { kind: 'ok' };
    }),
  );
}
