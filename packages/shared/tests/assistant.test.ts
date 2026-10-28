import { describe, expect, it } from 'vitest';
import { ASSISTANT_HISTORY_MAX, assistantMessageSchema, assistantTextProblem, isUrgentAssistantText } from '../src/index.js';

// The assistant's shared rules (Afik 28.10.2026): VAL-053 (a message of 1 to 1,000 characters, trimmed; at most six earlier messages and nothing
// else in the body, NFR-PRIV-008) and BR-093 (urgent words show the banner, whatever the model does).

describe('[VAL-053] a message to the assistant', () => {
  it('is trimmed and accepted up to 1,000 characters', () => {
    expect(assistantTextProblem('  מתי מתחילים לשמוע דופק?  ')).toBeNull();
    expect(assistantTextProblem('א'.repeat(1000))).toBeNull();
  });
  it('is refused blank, over 1,000 characters or with a NUL', () => {
    expect(assistantTextProblem('   ')).toBe('empty');
    expect(assistantTextProblem('א'.repeat(1001))).toBe('long');
    expect(assistantTextProblem('a\u0000b')).toBe('invalid');
  });
  it('carries at most six earlier messages, and no other field (NFR-PRIV-008)', () => {
    const turn = { role: 'user' as const, text: 'שאלה' };
    expect(assistantMessageSchema.safeParse({ text: 'שלום', history: [] }).success).toBe(true);
    expect(assistantMessageSchema.safeParse({ text: 'שלום', history: Array(ASSISTANT_HISTORY_MAX).fill(turn) }).success).toBe(true);
    expect(assistantMessageSchema.safeParse({ text: 'שלום', history: Array(ASSISTANT_HISTORY_MAX + 1).fill(turn) }).success).toBe(false);
    expect(assistantMessageSchema.safeParse({ text: 'שלום', history: [], name: 'דנה' }).success).toBe(false);
    expect(assistantMessageSchema.safeParse({ text: 'שלום', history: [{ role: 'system', text: 'x' }] }).success).toBe(false);
  });
});

describe('[BR-093] the urgent words', () => {
  it.each(['יש לי דימום בשבוע 30', 'התינוק לא נושם!', 'חום גבוה לתינוק בן חודש', 'הבן שלי נחנק', 'ירדו לי המים', 'הִיא לֹא נוֹשֶׁמֶת', 'התינוק לא\u05BEנושם'])('"%s" is urgent', (text) => {
    expect(isUrgentAssistantText(text)).toBe(true);
  });
  it.each(['מתי מתחילים לשמוע דופק?', 'איך מרדימים תינוק בן 4 חודשים', 'רעיונות לארוחת בוקר בהריון'])('"%s" is not', (text) => {
    expect(isUrgentAssistantText(text)).toBe(false);
  });
});
