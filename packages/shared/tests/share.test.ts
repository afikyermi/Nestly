import { describe, expect, it } from 'vitest';
import { POST_BODY_MAX, createShareSchema, feedUnit, postLinkOf, shareTargetOf, shareTargetsOf, siteLinkOf, type FeedUnit } from '../src/index.js';

// F3.5 c1, c2 (.work/share-in-feed/spec.md) and F3.6 c1, c2 (.work/share-link/spec.md). Expected values come from the specs only.
// Fixtures are checked by the feed unit's own Zod (amended: original.isMine), so a fixture can never drift from the contract.

const ID = (n: number): string => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BASE = { source: 'organic', audience: 'everyone', stageTag: null, createdAt: '2026-06-14T09:10:00.000Z', likeCount: 0, commentCount: 0, likedByMe: false } as const;
const unit = (raw: unknown): FeedUnit => feedUnit.parse(raw);
const named = (n: number, over: Record<string, unknown> = {}): FeedUnit =>
  unit({ ...BASE, id: ID(n), kind: 'post', body: 'סוד-123', isMine: false, isAnonymous: false, author: { name: 'דנה' }, ...over });
const anonymous = (n: number, over: Record<string, unknown> = {}): FeedUnit =>
  unit({ ...BASE, id: ID(n), kind: 'post', body: 'סוד-123', isMine: false, isAnonymous: true, ...over });
const original = (n: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  available: true, id: ID(n), body: 'סוד-123', audience: 'everyone', createdAt: '2026-06-13T08:00:00.000Z', isAnonymous: false, isMine: false, author: { name: 'דנה' }, ...over,
});
const share = (n: number, orig: Record<string, unknown>, over: Record<string, unknown> = {}): FeedUnit =>
  unit({ ...BASE, id: ID(n), kind: 'share', body: null, sharerText: 'תודה', isMine: false, isAnonymous: false, author: { name: 'רונית' }, original: orig, ...over });

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c1][FR-FEED-006][VAL-038] createShareSchema', () => {
  const ok = { audience: 'everyone' } as const;
  const codesOf = (r: { success: boolean; error?: { issues: ReadonlyArray<{ message: string }> } }): string[] => r.error?.issues.map((i) => i.message) ?? [];

  it('[F3.5 c1] the share text limit is the post limit, 2,000', () => expect(POST_BODY_MAX).toBe(2000));

  it('[F3.5 c1] text is optional: absent, empty, blank and whitespace-only all become null', () => {
    for (const body of [{ ...ok }, { ...ok, text: '' }, { ...ok, text: '   ' }, { ...ok, text: '\n\t ' }]) {
      const result = createShareSchema.safeParse(body);
      expect(result.success, JSON.stringify(body)).toBe(true);
      expect(result.success && result.data.text, JSON.stringify(body)).toBeNull();
    }
  });

  it('[F3.5 c1] text is trimmed', () => {
    const result = createShareSchema.safeParse({ ...ok, text: '  שלום  ' });
    expect(result.success && result.data.text).toBe('שלום');
  });

  it('[F3.5 c1] 2,000 code points pass; 2,001 fail body_too_long (counted in code points, after trimming)', () => {
    expect(createShareSchema.safeParse({ ...ok, text: 'א'.repeat(2000) }).success).toBe(true);
    expect(createShareSchema.safeParse({ ...ok, text: '😀'.repeat(2000) }).success).toBe(true);
    expect(createShareSchema.safeParse({ ...ok, text: ` ${'א'.repeat(2000)} ` }).success).toBe(true);
    for (const text of ['א'.repeat(2001), '😀'.repeat(2001)]) {
      const over = createShareSchema.safeParse({ ...ok, text });
      expect(over.success).toBe(false);
      expect(codesOf(over)).toContain('body_too_long');
    }
  });

  it('[F3.5 c1] audience is required and is everyone or friends only', () => {
    expect(createShareSchema.safeParse({ audience: 'everyone' }).success).toBe(true);
    expect(createShareSchema.safeParse({ audience: 'friends' }).success).toBe(true);
    for (const body of [{}, { text: 'x' }, { audience: null }, { audience: 'Everyone' }, { audience: 'private' }, { audience: '' }, { audience: 1 }]) {
      expect(createShareSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it.each(['sharedPostId', 'authorId', 'isAnonymous', 'stageTag', 'status', 'id', 'body', 'extra'])('[F3.5 c1] the key %s is refused (strict)', (key) => {
    expect(createShareSchema.safeParse({ ...ok, [key]: key === 'isAnonymous' ? false : 'x' }).success).toBe(false);
  });

  it('[F3.5 c1] a wrong type for text is refused, not coerced', () => {
    for (const text of [5, true, {}, ['a']]) expect(createShareSchema.safeParse({ ...ok, text }).success, JSON.stringify(text)).toBe(false);
  });

  it('[F3.5 c1] not an object → refused', () => {
    for (const body of [null, undefined, 'x', 5, []]) expect(createShareSchema.safeParse(body).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.5 c2][BR-064][BR-066] shareTargetOf', () => {
  it('[F3.5 c2] a named everyone post that is not mine → its own id', () => expect(shareTargetOf(named(1))).toBe(ID(1)));

  it('[F3.5 c2] a share whose original is available, everyone and not mine → the ORIGINAL id, never the share id (BR-066)', () => {
    expect(shareTargetOf(share(2, original(9)))).toBe(ID(9));
  });

  it.each([
    ['an anonymous post', anonymous(3)],
    ['a friends post', named(4, { audience: 'friends' })],
    ['my own post', named(5, { isMine: true })],
    ['a share whose original is unavailable', share(6, { available: false })],
    ['a share whose original is now friends', share(7, original(9, { audience: 'friends' }))],
    ['a share whose original is mine', share(8, original(9, { isMine: true }))],
  ])('[F3.5 c2] %s → null', (_label, u) => expect(shareTargetOf(u)).toBeNull());

  it('[F3.5 c2] a friends-only share (audience of the share row) of an everyone original → still the original id', () => {
    expect(shareTargetOf(share(11, original(9), { audience: 'friends' }))).toBe(ID(9));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.6 c1][FR-FEED-007][BR-064] postLinkOf and siteLinkOf', () => {
  const ORIGIN = 'https://nestly.example';

  it('[F3.6 c1] a named everyone post → origin/posts/id, own post included', () => {
    expect(postLinkOf(ORIGIN, named(1))).toBe(`${ORIGIN}/posts/${ID(1)}`);
    expect(postLinkOf(ORIGIN, named(5, { isMine: true }))).toBe(`${ORIGIN}/posts/${ID(5)}`);
  });

  it('[F3.6 c1] a share → its original\'s link when available and everyone', () => {
    expect(postLinkOf(ORIGIN, share(2, original(9)))).toBe(`${ORIGIN}/posts/${ID(9)}`);
  });

  it.each([
    ['an anonymous post', anonymous(3)],
    ['a friends post', named(4, { audience: 'friends' })],
    ['a share whose original is unavailable', share(6, { available: false })],
    ['a share whose original is friends', share(7, original(9, { audience: 'friends' }))],
  ])('[F3.6 c1] %s → null', (_label, u) => expect(postLinkOf(ORIGIN, u)).toBeNull());

  it('[F3.6 c1] siteLinkOf → origin + "/"', () => expect(siteLinkOf(ORIGIN)).toBe(`${ORIGIN}/`));

  it('[F3.6 c1] the URL has no query, no fragment, no user id and no text', () => {
    const url = postLinkOf(ORIGIN, named(1, { body: 'סוד-123' }));
    expect(url).not.toBeNull();
    expect(url).not.toMatch(/[?#]/);
    expect(url).not.toContain('סוד');
    expect(url).not.toContain(encodeURIComponent('סוד'));
    expect(url).not.toContain('דנה');
    expect((url ?? '').slice(ORIGIN.length)).toBe(`/posts/${ID(1)}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('[F3.6 c2][FR-FEED-007][NFR-PRIV-007] the payloads carry the title and the URL, nothing else', () => {
  const url = postLinkOf('https://nestly.example', named(1, { body: 'סוד-123', author: { name: 'דנה' } })) ?? '';
  const SECRETS = ['סוד-123', 'דנה', 'everyone', 'friends', 'pregnant', '2026'];
  const decoded = (value: string): string => decodeURIComponent(value);

  it.each([
    ['post', 'פוסט ב-Nestly'],
    ['site', 'Nestly'],
  ])('[F3.6 c2] %s: WhatsApp, email and device share hold exactly the title and the URL', (kind, title) => {
    const link = kind === 'post' ? url : siteLinkOf('https://nestly.example');
    const t = shareTargetsOf(title, link);

    expect(t.whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decoded(t.whatsapp.slice('https://wa.me/?text='.length))).toBe(`${title} ${link}`);

    expect(t.email.startsWith('mailto:?subject=')).toBe(true);
    const [subject, body, ...rest] = t.email.slice('mailto:?subject='.length).split('&body=');
    expect(rest).toEqual([]);
    expect([decoded(subject ?? ''), decoded(body ?? '')]).toEqual([title, link]);

    expect(t.device).toEqual({ title, url: link });
    expect(Object.keys(t.device).sort()).toEqual(['title', 'url']);

    const everything = [t.whatsapp, t.email, JSON.stringify(t.device)].map(decoded).join('\n');
    for (const secret of SECRETS) expect(everything, secret).not.toContain(secret);
  });
});
