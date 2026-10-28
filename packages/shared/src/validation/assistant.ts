// The Nestly assistant (Afik 28.10.2026; FR-AI-001, VAL-053, NFR-PRIV-008). The web checks what it sends and the server checks again, by the same
// rules. The body is strict: the new message and at most ASSISTANT_HISTORY_MAX earlier messages of the same conversation, and nothing else —
// no name, no account detail.
import { z } from 'zod';
import { ASSISTANT_ANSWER_MAX, ASSISTANT_HISTORY_MAX, ASSISTANT_TEXT_MAX } from '../constants/assistant.js';
import { codePointLength } from './text.js';

/** What is wrong with a message to the assistant, by the rule the server applies to the trimmed text (VAL-053). */
export function assistantTextProblem(text: string): 'empty' | 'long' | 'invalid' | null {
  const value = text.trim();
  if (value === '') return 'empty';
  if (value.includes('\u0000')) return 'invalid';
  return codePointLength(value) > ASSISTANT_TEXT_MAX ? 'long' : null;
}

const assistantText = z
  .string()
  .refine((value) => assistantTextProblem(value) === null, 'invalid')
  .transform((value) => value.trim());

const earlierMessage = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z
    .string()
    .refine((value) => value.trim() !== '' && !value.includes('\u0000') && codePointLength(value) <= ASSISTANT_ANSWER_MAX, 'invalid'),
});

/** POST /api/assistant: the new message and the last few messages of the same conversation, oldest first. */
export const assistantMessageSchema = z.strictObject({
  text: assistantText,
  history: z.array(earlierMessage).max(ASSISTANT_HISTORY_MAX),
});
export type AssistantMessageRequest = z.infer<typeof assistantMessageSchema>;
export type AssistantTurn = AssistantMessageRequest['history'][number];

/** The answer of POST /api/assistant. */
export const assistantAnswerSchema = z.object({ answer: z.string() });
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

/** GET /api/assistant: whether the assistant can answer now (it has its service key). */
export const assistantStatusSchema = z.object({ available: z.boolean() });
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;
