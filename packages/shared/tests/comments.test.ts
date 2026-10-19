import { describe, expect, it } from 'vitest';
import { COMMENT_BODY_MAX, checkCreateComment, parseCommentCursor } from '../src/index.js';

// I3 F3.3-b1 c2 (.work/comments-likes/spec.md): the shared comment VAL. Expected values are the spec's, not the schema's.
const ID = '11111111-1111-4111-8111-111111111111';

describe('[F3.3-b1 c2] checkCreateComment', () => {
  it('[F3.3-b1 c2] COMMENT_BODY_MAX is 1000, and 1,000 code points pass while 1,001 is body_too_long', () => {
    expect(COMMENT_BODY_MAX).toBe(1000);
    for (const unit of ['א', '😀']) {
      expect(checkCreateComment({ body: unit.repeat(1000) }).ok).toBe(true);
      expect(checkCreateComment({ body: unit.repeat(1001) })).toEqual({ ok: false, reason: 'body_too_long' });
    }
  });

  it('[F3.3-b1 c2] the text is trimmed; blank is body_required; NUL and every extra key are invalid', () => {
    expect(checkCreateComment({ body: '  שלום  ' })).toEqual({ ok: true, value: { body: 'שלום' } });
    for (const body of ['', '   ', '\n\t']) expect(checkCreateComment({ body })).toEqual({ ok: false, reason: 'body_required' });
    expect(checkCreateComment({ body: 'a\u0000b' })).toEqual({ ok: false, reason: 'invalid' });
    for (const extra of [{ authorId: ID }, { byAuthor: true }, { status: 'active' }, { postId: ID }]) {
      expect(checkCreateComment({ body: 'x', ...extra }), JSON.stringify(extra)).toEqual({ ok: false, reason: 'invalid' });
    }
    for (const bad of [null, 'x', [], {}, { body: 5 }, { body: 'x', parentId: 'nope' }]) expect(checkCreateComment(bad).ok).toBe(false);
    expect(checkCreateComment({ body: 'x', parentId: ID })).toEqual({ ok: true, value: { body: 'x', parentId: ID } });
  });

  it('[F3.3-b1 c8] a cursor that is not exactly one is null', () => {
    for (const bad of ['', 'x', ID, `2026-01-01T00:00:00Z~${ID}`, `2026-01-01T00:00:00.000000Z~nope`, 5, null]) expect(parseCommentCursor(bad)).toBeNull();
    expect(parseCommentCursor(`2026-01-01T00:00:00.123456Z~${ID}`)).toEqual({ createdAt: '2026-01-01T00:00:00.123456Z', id: ID });
  });
});
