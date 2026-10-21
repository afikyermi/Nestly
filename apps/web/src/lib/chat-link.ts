import { chatIdParams } from '@nestly/shared';

// The addresses of chat and Support (I8): `/chat/<conversation id>` and `/support/<request id>`, and nothing else in them. `/chat` and `/support`
// are fixed paths of their own (the Chat Center, and the Support form with the caller's requests).
export const CONVERSATION_PATTERN = '/chat/:conversationId';
export const SUPPORT_THREAD_PATTERN = '/support/:requestId';

export const conversationPath = (id: string): string => `/chat/${id}`;
export const supportThreadPath = (id: string): string => `/support/${id}`;

function idOf(path: string, prefix: string): string | null {
  const match = new RegExp(`^/${prefix}/([^/]+)$`).exec(path);
  const checked = chatIdParams.safeParse({ id: match?.[1] });
  return checked.success ? checked.data.id : null;
}

/** The conversation id of a `/chat/<id>` path (any trailing slash already removed), else null: only a uuid counts. */
export const conversationIdOfPath = (path: string): string | null => idOf(path, 'chat');

/** The request id of a `/support/<id>` path, else null. */
export const supportIdOfPath = (path: string): string | null => idOf(path, 'support');
