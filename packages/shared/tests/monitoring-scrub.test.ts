import { describe, expect, it } from 'vitest';
import { MAX_SCRUBBED_TEXT, scrubText, templateUrl } from '../src/index.js';

// SRS §12 "Error monitoring": no personal data leaves in an error report. The two rules every report passes through on the server
// and in the web app.

describe('[§12 Error monitoring] scrubText removes what can name or reach a person', () => {
  it.each([
    ['an email', 'no account for dana.levi+1@example.co.il here', 'dana.levi'],
    ['a JWT', `bad token ${['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'sig-part_1'].join('.')}`, 'eyJhbGci'],
    ['a bearer header', 'header was Bearer abc.DEF-123_xyz', 'abc.DEF'],
    ['a uuid', 'post 6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f not found', '6f1c2a9e'],
    ['a phone number', 'call 050-123-4567 now', '123-4567'],
    ['an id number', 'id 012345678', '012345678'],
    ['Hebrew text', 'failed: "הבת שלי נולדה" in post', 'נולדה'],
    ['Russian text', 'no row for Иван Петров', 'Иван'],
    ['Arabic text', 'failed for مريم', 'مريم'],
    ['an accented Latin name', 'agg José Müller', 'Jos'],
    ['a long opaque key', `key ${['opaque', 'abcDEF1234567890xyz'].join('_')} leaked`, 'abcDEF1234567890'],
    ['a query string', 'GET https://x.supabase.co/auth/v1/verify?token=abc123&type=signup', 'token=abc123'],
    ['query params bound to SQL', 'Failed query: select 1 where email = $1\nparams: a@b.co,דנה', 'params: a@b'],
    ['a Postgres key detail', 'duplicate key Key (email)=(x@y.zz) already exists', '(x@y.zz)'],
    ['quoted invalid input', 'invalid input syntax for type uuid: "not-a-uuid"', 'not-a-uuid'],
    ['long quoted input', `Unexpected token, "{\"text\": \"some private note here\"" is not valid JSON`, 'private note'],
  ])('%s', (_label, input, secret) => {
    const out = scrubText(input);
    expect(out).not.toContain(secret);
  });

  it('keeps what finds the bug: error words, SQL shape, constraint and type names', () => {
    expect(scrubText('duplicate key value violates unique constraint "posts_pkey"')).toBe('duplicate key value violates unique constraint "posts_pkey"');
    expect(scrubText("Cannot read properties of undefined (reading 'map')")).toBe("Cannot read properties of undefined (reading 'map')");
    expect(scrubText('Failed query: insert into posts values ($1)\nparams: x')).toBe('Failed query: insert into posts values ($1)\nparams: [scrubbed]');
  });

  it('a run of non-ASCII words becomes one placeholder; the ASCII around it stays', () => {
    expect(scrubText('failed: "הבת שלי נולדה" in post')).toBe('failed: "[text]" in post');
    expect(scrubText('button[aria-label="Иван Петров"]')).toBe('button[aria-label="[text]"]');
  });

  it(`cuts at ${MAX_SCRUBBED_TEXT} characters`, () => {
    expect(scrubText('a '.repeat(1000)).length).toBeLessThanOrEqual(MAX_SCRUBBED_TEXT + 1);
  });
});

describe('[§12 Error monitoring] templateUrl keeps the route shape only', () => {
  it.each([
    ['https://nestly.example/u/6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f?x=1#y', 'https://nestly.example/u/:id'],
    ['/api/posts/123/comments', '/api/posts/:id/comments'],
    ['/api/children/abcdefABCDEF1234567', '/api/children/:id'],
    ['/search/%D7%93%D7%A0%D7%94', '/search/:text'],
    ['/u/dana@example.com', '/u/:id'],
    ['/groups/דנה', '/groups/:text'],
    ['https://user:pass@host.example/feed', 'https://host.example/feed'],
    ['/api/posts/:postId', '/api/posts/:postId'],
    ['/feed', '/feed'],
    ['/var/task/node_modules/@supabase/auth-js/dist/main/lib/fetch.js', '/var/task/node_modules/@supabase/auth-js/dist/main/lib/fetch.js'],
  ])('%s → %s', (input, expected) => {
    expect(templateUrl(input)).toBe(expected);
  });
});
