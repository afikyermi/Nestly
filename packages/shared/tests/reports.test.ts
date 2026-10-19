import { describe, expect, it } from 'vitest';
import { REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_TARGET_KINDS, checkCreateReport } from '../src/index.js';

// I3 F3.7 c3 (+ the body half of c2, c11 order): the one shared report rule. Expected values are the spec's (.work/report/spec.md), not the schema's.
const ID = '11111111-1111-4111-8111-111111111111';
const ok = (extra: Record<string, unknown> = {}) => ({ targetKind: 'post', targetId: ID, reason: 'spam', ...extra });

describe('[F3.7 c3][FR-MOD-001] checkCreateReport', () => {
  it('[c3][c11] the eight reasons are in FR-MOD-001 order, child safety first; the targets are post, comment, user', () => {
    expect([...REPORT_REASONS]).toEqual([
      'child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information', 'medical_misinformation', 'impersonation', 'spam', 'other',
    ]);
    expect([...REPORT_TARGET_KINDS]).toEqual(['post', 'comment', 'user']);
    expect(REPORT_DETAILS_MAX).toBe(1000);
  });

  it('[c3] every reason and every target kind passes; details are optional', () => {
    for (const reason of REPORT_REASONS.filter((r) => r !== 'other')) expect(checkCreateReport(ok({ reason })), reason).toEqual({ ok: true, value: { targetKind: 'post', targetId: ID, reason, details: null } });
    for (const targetKind of REPORT_TARGET_KINDS) expect(checkCreateReport(ok({ targetKind })).ok, targetKind).toBe(true);
  });

  it('[c3] a reason outside the 8 keys, a wrong type or an absent reason is invalid', () => {
    for (const reason of ['', 'Spam', 'SPAM', 'child-safety', 'violence', 'other ', 5, null, ['spam'], undefined]) {
      expect(checkCreateReport(ok({ reason })), String(reason)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(checkCreateReport({ targetKind: 'post', targetId: ID })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('[c3][c2] a target kind outside the three, a target id that is not a uuid, and a missing field are invalid', () => {
    for (const targetKind of ['listing', 'group', 'Post', '', 1, null]) expect(checkCreateReport(ok({ targetKind })).ok, String(targetKind)).toBe(false);
    for (const targetId of ['', 'nope', '123', ID + 'x', 5, null, "' or 1=1 --"]) expect(checkCreateReport(ok({ targetId })).ok, String(targetId)).toBe(false);
    expect(checkCreateReport({ reason: 'spam', targetId: ID }).ok).toBe(false);
  });

  it('[c3] the details are trimmed; blank is null (absent too)', () => {
    expect(checkCreateReport(ok({ details: '  הם מפרסמים כאן  ' }))).toEqual({ ok: true, value: { targetKind: 'post', targetId: ID, reason: 'spam', details: 'הם מפרסמים כאן' } });
    for (const details of ['', '   ', '\n\t ']) expect(checkCreateReport(ok({ details })), JSON.stringify(details)).toEqual({ ok: true, value: { targetKind: 'post', targetId: ID, reason: 'spam', details: null } });
  });

  it('[c3] 1,000 code points pass and 1,001 are invalid, counting an emoji as one point and measuring after the trim', () => {
    for (const unit of ['a', 'א', '😀']) {
      expect(checkCreateReport(ok({ details: unit.repeat(1000) })).ok, `${unit} x1000`).toBe(true);
      expect(checkCreateReport(ok({ details: unit.repeat(1001) })).ok, `${unit} x1001`).toBe(false);
    }
    expect(checkCreateReport(ok({ details: `  ${'a'.repeat(1000)}  ` })).ok).toBe(true);
  });

  it('[c3] a NUL in the details is invalid (also inside, also after other text); a wrong type is invalid', () => {
    for (const details of ['\u0000', 'a\u0000b', 'x'.repeat(5) + '\u0000']) expect(checkCreateReport(ok({ details })), JSON.stringify(details)).toEqual({ ok: false, reason: 'invalid' });
    for (const details of [5, true, [], {}]) expect(checkCreateReport(ok({ details })).ok, JSON.stringify(details)).toBe(false);
  });

  it('[c3] "other" without details (absent, empty, blank) is details_required; with details it passes', () => {
    for (const body of [ok({ reason: 'other' }), ok({ reason: 'other', details: '' }), ok({ reason: 'other', details: '   ' })]) {
      expect(checkCreateReport(body)).toEqual({ ok: false, reason: 'details_required' });
    }
    expect(checkCreateReport(ok({ reason: 'other', details: 'משהו אחר' })).ok).toBe(true);
  });

  it('[c2] the body is strict: reporterId, status and every other key are invalid; so is a non-object', () => {
    for (const extra of [{ reporterId: ID }, { reporter_id: ID }, { status: 'closed' }, { postId: ID }, { id: ID }, { createdAt: 'x' }]) {
      expect(checkCreateReport(ok(extra)), JSON.stringify(extra)).toEqual({ ok: false, reason: 'invalid' });
    }
    for (const bad of [null, undefined, 'x', 5, [], [ok()]]) expect(checkCreateReport(bad).ok).toBe(false);
  });

  it('[c3] a target id is lower-cased', () => {
    const upper = 'ABCDEF01-2345-4678-89AB-CDEF01234567';
    const checked = checkCreateReport(ok({ targetId: upper }));
    expect(checked).toEqual({ ok: true, value: { targetKind: 'post', targetId: upper.toLowerCase(), reason: 'spam', details: null } });
  });
});
