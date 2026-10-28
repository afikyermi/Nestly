// The Nestly assistant's model (Afik 28.10.2026; FR-AI-001, ERR-055, NFR-PRIV-008): Google's Gemini API, free tier. Flash-Lite by default;
// GEMINI_MODEL switches it (Flash, for example) with no code change. The key is GEMINI_API_KEY, set by Afik in Vercel (Preview and
// Production); without it the assistant is unavailable and nothing is called. CI never calls Google: tests pass their own AssistantModel.
//
// What leaves for Google: the standing instructions, the user's new message and at most ASSISTANT_HISTORY_MAX earlier messages of the same
// conversation, exactly as typed or answered. Never a name, an id or anything else from the account. Nothing of it reaches a log line: a
// failure is logged by its kind and HTTP status only.

import { ASSISTANT_ANSWER_MAX, type AssistantTurn } from '@nestly/shared';
import { ASSISTANT_INSTRUCTIONS } from './instructions.js';

const KEY_ENV = 'GEMINI_API_KEY';
const MODEL_ENV = 'GEMINI_MODEL';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const MODEL_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** How long an answer may take before the user is told the assistant is unavailable (Afik 28.10.2026). */
export const ASSISTANT_TIMEOUT_MS = 10_000;

/** Why no answer came: the user sees one message for all of them (ERR-055); the log gets the kind. */
export type AssistantFailure = 'timeout' | 'quota' | 'error' | 'blocked' | 'empty';

export type AssistantReply = { readonly kind: 'ok'; readonly answer: string } | { readonly kind: 'failed'; readonly failure: AssistantFailure; readonly status?: number };

export interface AssistantModel {
  /** False when no key is configured: the assistant is shown as unavailable and nothing is sent. */
  readonly available: boolean;
  answer(history: readonly AssistantTurn[], text: string): Promise<AssistantReply>;
}

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

export const UNAVAILABLE_MODEL: AssistantModel = {
  available: false,
  answer: () => Promise.resolve({ kind: 'failed', failure: 'error' }),
};

/** The model named by the environment, or UNAVAILABLE_MODEL without a key. */
export function createAssistantModel(env: Env = process.env, fetchImpl: Fetch = fetch): AssistantModel {
  const key = env[KEY_ENV]?.trim();
  if (key === undefined || key === '') return UNAVAILABLE_MODEL;
  const named = env[MODEL_ENV]?.trim();
  const model = named !== undefined && MODEL_NAME.test(named) ? named : DEFAULT_MODEL;
  const url = `${API}/${model}:generateContent`;
  return {
    available: true,
    async answer(history, text) {
      const contents = [...history, { role: 'user' as const, text }].map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.text }],
      }));
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ASSISTANT_INSTRUCTIONS }] },
            contents,
            generationConfig: generationConfig(model),
          }),
          signal: AbortSignal.timeout(ASSISTANT_TIMEOUT_MS),
        });
      } catch (error) {
        const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
        return { kind: 'failed', failure: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error' };
      }
      if (response.status === 429) return { kind: 'failed', failure: 'quota', status: 429 };
      if (!response.ok) return { kind: 'failed', failure: 'error', status: response.status };
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
        return { kind: 'failed', failure: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error' };
      }
      return readAnswer(body);
    },
  };
}

/**
 * A short, plain answer. A 2.5 model that thinks (Flash does by default) would spend the output budget and the time limit on thinking, so
 * thinking is off for those; other models keep their own default.
 */
export function generationConfig(model: string): Record<string, unknown> {
  return { temperature: 0.4, maxOutputTokens: 1024, ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) };
}

/** The answer's text from a generateContent body; a blocked or empty one is a failure (the user sees the same message). */
export function readAnswer(body: unknown): AssistantReply {
  if (typeof body !== 'object' || body === null) return { kind: 'failed', failure: 'error' };
  const feedback = 'promptFeedback' in body ? body.promptFeedback : undefined;
  if (typeof feedback === 'object' && feedback !== null && 'blockReason' in feedback) return { kind: 'failed', failure: 'blocked' };
  const candidates: unknown[] = 'candidates' in body && Array.isArray(body.candidates) ? body.candidates : [];
  const first = candidates[0];
  if (typeof first !== 'object' || first === null) return { kind: 'failed', failure: 'empty' };
  const content = 'content' in first ? first.content : undefined;
  const parts: unknown[] = typeof content === 'object' && content !== null && 'parts' in content && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('');
  const answer = plainText(text);
  const reason = 'finishReason' in first ? first.finishReason : undefined;
  if (answer === '') return { kind: 'failed', failure: reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' ? 'blocked' : 'empty' };
  // An answer cut at the length limit says so; any answer fits what the next message may send back as history (ASSISTANT_ANSWER_MAX).
  const whole = reason === 'MAX_TOKENS' ? `${answer} …` : answer;
  const points = Array.from(whole);
  return { kind: 'ok', answer: points.length <= ASSISTANT_ANSWER_MAX ? whole : `${points.slice(0, ASSISTANT_ANSWER_MAX - 2).join('')} …` };
}

/** The answer as plain text: the screen shows text, not Markdown, so emphasis marks go and list stars become bullets. */
export function plainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[*-][ \t]+/gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
