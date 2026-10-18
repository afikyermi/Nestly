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
  it('[F3.1-a c1] the limit is 2,000', () => {
    expect(POST_BODY_MAX).toBe(2000);
  });

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

  it('[F3.1-a c1] the cap is counted after trimming', () => {
    expect(createPostSchema.safeParse({ ...ok, body: ` ${'א'.repeat(2000)} ` }).success).toBe(true);
  });

  it.each([null, undefined, 5, ['x']])('[F3.1-a c1] a non-string body %j is refused', (body) => {
    expect(createPostSchema.safeParse({ ...ok, body }).success).toBe(false);
  });
});

it.each(SCHEMAS)('[F3.1-a c1] %s refuses a body containing U+0000', (_name, schema) => {
  expect(schema.safeParse({ ...ok, body: 'hello\u0000' }).success).toBe(false);
});

describe.each(SCHEMAS)('[F3.1-a c2] %s is strict (BR-062, VAL-036)', (_name, schema) => {
  it.each(['isAnonymous', 'authorId', 'status', 'sharedPostId', 'id'])('[F3.1-a c2] key %s is rejected', (key) => {
    expect(schema.safeParse({ ...ok, [key]: key === 'isAnonymous' ? false : 'x' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, [key]: key === 'isAnonymous' ? true : null }).success).toBe(false);
  });

  it('[F3.1-a c2] an unknown key is rejected', () => {
    expect(schema.safeParse({ ...ok, topic: 'x' }).success).toBe(false);
  });

  it.each(['public', 'Everyone', '', null, 1])('[F3.1-a c2] audience %j is rejected', (audience) => {
    expect(schema.safeParse({ ...ok, audience }).success).toBe(false);
  });

  it.each(['everyone', 'friends'])('[F3.1-a c2] audience %s is valid', (audience) => {
    expect(schema.safeParse({ ...ok, audience }).success).toBe(true);
  });

  it.each(['topic-x', '', 'Pregnant', 5])('[F3.1-a c2] stageTag %j is rejected', (stageTag) => {
    expect(schema.safeParse({ ...ok, stageTag }).success).toBe(false);
  });

  it.each(JOURNEY_STAGES)('[F3.1-a c2] stageTag %s is valid', (stageTag) => {
    expect(schema.safeParse({ ...ok, stageTag }).success).toBe(true);
  });

  it('[F3.1-a c2] stageTag null and absent are valid', () => {
    expect(schema.safeParse({ ...ok, stageTag: null }).success).toBe(true);
    expect(schema.safeParse(ok).success).toBe(true);
  });
});
