import { describe, expect, it } from 'vitest';
import { JOURNEY_STAGES, POST_BODY_MAX, createPostSchema, updatePostSchema } from '../src/index.js';

// F3.1a criteria 1 and 2 (.work/post-create/spec.md). Expected values come from the spec only.
const ok = { body: 'שלום', audience: 'everyone' };
const codesOf = (result: { success: boolean; error?: { issues: ReadonlyArray<{ message: string }> } }): string[] =>
  result.error?.issues.map((i) => i.message) ?? [];
const SCHEMAS = [
  ['createPostSchema', createPostSchema],
  ['updatePostSchema', updatePostSchema],
] as const;

describe('[F3.1-a c1] body length VAL', () => {
  it('[F3.1-a c1] the limit is 2,000', () => expect(POST_BODY_MAX).toBe(2000));

  it.each(['', '   ', '\n\t '])('[F3.1-a c1] %j fails body_required', (body) => {
    const result = createPostSchema.safeParse({ ...ok, body });
    expect(result.success).toBe(false);
    expect(codesOf(result)).toContain('body_required');
  });

  it('[F3.1-a c1] trims the body', () => {
    const result = createPostSchema.safeParse({ ...ok, body: '  שלום  ' });
    expect(result.success && result.data.body).toBe('שלום');
  });

  it('[F3.1-a c1] 2,000 code points pass; 2,001 fail body_too_long', () => {
    expect(createPostSchema.safeParse({ ...ok, body: 'א'.repeat(2000) }).success).toBe(true);
    const over = createPostSchema.safeParse({ ...ok, body: 'א'.repeat(2001) });
    expect(over.success).toBe(false);
    expect(codesOf(over)).toContain('body_too_long');
  });

  it('[F3.1-a c1] counts code points, not UTF-16 units: 2,000 emoji pass, 2,001 fail', () => {
    expect(createPostSchema.safeParse({ ...ok, body: '😀'.repeat(2000) }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...ok, body: '😀'.repeat(2001) }).success).toBe(false);
  });

  it('[F3.1-a c1] the cap is counted after trimming', () => expect(createPostSchema.safeParse({ ...ok, body: ` ${'א'.repeat(2000)} ` }).success).toBe(true));

  it.each([null, undefined, 5, ['x']])('[F3.1-a c1] a non-string body %j is refused', (body) => expect(createPostSchema.safeParse({ ...ok, body }).success).toBe(false));
});

describe.each(SCHEMAS)('[F3.1-a c2] %s is strict (BR-062, VAL-036)', (_name, schema) => {
  // F3.4 c1 amends this: createPostSchema now accepts `isAnonymous` (block at the end); updatePostSchema still refuses it (asserted there).
  it.each(['authorId', 'status', 'sharedPostId', 'id'])('[F3.1-a c2] key %s is rejected', (key) => {
    expect(schema.safeParse({ ...ok, [key]: 'x' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, [key]: null }).success).toBe(false);
  });

  it('[F3.1-a c1] a body containing U+0000 is refused', () => expect(schema.safeParse({ ...ok, body: 'hello\u0000' }).success).toBe(false));

  it('[F3.1-a c2] an unknown key is rejected', () => expect(schema.safeParse({ ...ok, topic: 'x' }).success).toBe(false));

  it.each(['public', 'Everyone', '', null, 1])('[F3.1-a c2] audience %j is rejected', (audience) => expect(schema.safeParse({ ...ok, audience }).success).toBe(false));

  it.each(['everyone', 'friends'])('[F3.1-a c2] audience %s is valid', (audience) => expect(schema.safeParse({ ...ok, audience }).success).toBe(true));

  it.each(['topic-x', '', 'Pregnant', 5])('[F3.1-a c2] stageTag %j is rejected', (stageTag) => expect(schema.safeParse({ ...ok, stageTag }).success).toBe(false));

  it.each(JOURNEY_STAGES)('[F3.1-a c2] stageTag %s is valid', (stageTag) => expect(schema.safeParse({ ...ok, stageTag }).success).toBe(true));

  it('[F3.1-a c2] stageTag null and absent are valid', () => {
    expect(schema.safeParse({ ...ok, stageTag: null }).success).toBe(true);
    expect(schema.safeParse(ok).success).toBe(true);
  });
});

// F3.4 c1 (.work/anonymous-post/spec.md): a post may be created anonymously; the edit still cannot change anonymity. FR-FEED-005 r.1, BR-062.
describe('[F3.4 c1 FR-FEED-005] createPostSchema.isAnonymous', () => {
  it('[F3.4 c1] absent is false: the parse succeeds and carries no anonymity', () => {
    const result = createPostSchema.safeParse(ok);
    expect(result.success).toBe(true);
    expect(result.success && (result.data.isAnonymous ?? false)).toBe(false);
  });

  it.each([true, false])('[F3.4 c1] isAnonymous %s with audience "everyone" is accepted and kept', (isAnonymous) => {
    const result = createPostSchema.safeParse({ ...ok, isAnonymous });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isAnonymous).toBe(isAnonymous);
  });

  it('[F3.4 c1] isAnonymous true with audience "friends" fails audience_not_allowed', () => {
    const result = createPostSchema.safeParse({ ...ok, audience: 'friends', isAnonymous: true });
    expect(result.success).toBe(false);
    expect(codesOf(result)).toContain('audience_not_allowed');
  });

  it('[F3.4 c1] isAnonymous false with audience "friends" is a normal friends post', () => {
    expect(createPostSchema.safeParse({ ...ok, audience: 'friends', isAnonymous: false }).success).toBe(true);
  });

  it.each(['true', 'false', 1, 0, null, [], {}])('[F3.4 c1] a non-boolean isAnonymous %j is refused', (isAnonymous) => {
    expect(createPostSchema.safeParse({ ...ok, isAnonymous }).success).toBe(false);
  });

  it('[F3.4 c1] the anonymity rule does not hide a body error: a blank body stays body_required', () => {
    const result = createPostSchema.safeParse({ body: ' ', audience: 'everyone', isAnonymous: true });
    expect(result.success).toBe(false);
    expect(codesOf(result)).toContain('body_required');
  });

  it.each([true, false])('[F3.4 c1] updatePostSchema still refuses isAnonymous %s, alone or beside valid fields', (isAnonymous) => {
    expect(updatePostSchema.safeParse({ ...ok, isAnonymous }).success).toBe(false);
    expect(updatePostSchema.safeParse({ isAnonymous }).success).toBe(false);
  });

  it.each(['authorId', 'status', 'id'])('[F3.4 c1] createPostSchema still refuses %s beside isAnonymous', (key) => {
    expect(createPostSchema.safeParse({ ...ok, isAnonymous: true, [key]: 'x' }).success).toBe(false);
  });
});
