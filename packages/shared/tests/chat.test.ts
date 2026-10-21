import { describe, expect, it } from 'vitest';
import { chatStartSchema, chatTextProblem, CHAT_TEXT_MAX, SUPPORT_TOPICS, supportRequestSchema, supportStaffMessageSchema, supportStatusSchema } from '../src/index.js';

// I8 chat and Support inputs (FR-CHAT-002/003, FR-ADMIN-001/002, VAL-025, VAL-026; Afik's decisions of 20.10.2026): the same rules on the web and
// the server, and the database's body checks (1-2000 characters, not blank).
const ID = 'b0000000-0000-4000-8000-0000000000b2';

describe('[I8 VAL-025] a chat or Support text', () => {
  it('is 1-2000 code points after trimming, never blank and never with a NUL', () => {
    expect(chatTextProblem('שלום')).toBeNull();
    expect(chatTextProblem('   ')).toBe('empty');
    expect(chatTextProblem('א'.repeat(CHAT_TEXT_MAX))).toBeNull();
    expect(chatTextProblem('א'.repeat(CHAT_TEXT_MAX + 1))).toBe('long');
    expect(chatTextProblem('😀'.repeat(CHAT_TEXT_MAX))).toBeNull(); // code points, not UTF-16 units
    expect(chatTextProblem('a\u0000b')).toBe('invalid');
  });

  it('a first message names the account and the text, trimmed, and nothing else', () => {
    expect(chatStartSchema.parse({ userId: ID.toUpperCase(), text: '  היי  ' })).toEqual({ userId: ID, text: 'היי' });
    expect(chatStartSchema.safeParse({ userId: ID, text: 'היי', requesterId: ID }).success).toBe(false);
    expect(chatStartSchema.safeParse({ userId: 'nope', text: 'היי' }).success).toBe(false);
  });
});

describe('[I8 FR-ADMIN-001 FR-ADMIN-002] Support', () => {
  it('[§9.1] the six topics, in the form order', () => {
    expect([...SUPPORT_TOPICS]).toEqual(['account', 'bug', 'privacy_safety', 'usage', 'suggestion', 'other']);
    expect(supportRequestSchema.safeParse({ topic: 'billing', text: 'x' }).success).toBe(false);
    expect(supportRequestSchema.safeParse({ topic: 'bug', text: 'x', status: 'closed' }).success).toBe(false);
  });

  it('a staff message says whether it is an internal note; a status is one of three', () => {
    expect(supportStaffMessageSchema.safeParse({ text: 'x' }).success).toBe(false);
    expect(supportStaffMessageSchema.parse({ text: ' x ', internal: true })).toEqual({ text: 'x', internal: true });
    expect(supportStatusSchema.safeParse({ status: 'reopened' }).success).toBe(false);
  });
});
