import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F3.3-b1 (.work/comments-likes/spec.md c3-c9; CLAUDE.md "Authorization lives in database RLS"), a static check by design: the promise is about
// what the repository's text contains. Same method as posts-repository.static.test.ts.
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const repository = code(read('../src/repositories/comments-repository.ts'));
// The one identity read is the display flag `isMine` in the select list (never a filter); it is cut out before the where scan, and pinned to that place.
const isMine = /case when c\.author_id is null[\s\S]*?end as "isMine"/.exec(repository)?.[0] ?? '';
const filters = repository.replace(isMine, '');
const whereClauses = [...filters.matchAll(/\bwhere\b([^`;]*)/gi)].map((m) => m[1] ?? '');

describe('[F3.3-b1 c3 c9] comments repository, static', () => {
  it('[F3.3-b1 c3] queries comments, and every query lists its columns', () => {
    expect(repository).toMatch(/nestly\.comments/);
    expect(repository).not.toMatch(/select\s+\*/i);
    expect(repository).not.toMatch(/returning\s+\*/i);
    expect(repository).not.toMatch(/\bc\.\*|\bto_jsonb\(|\brow_to_json\(/i);
  });

  it('[F3.3-b1 c4 c9] no where on author, status, audience or identity: permission is RLS, the id or the page key is the only key', () => {
    expect(isMine).not.toBe('');
    expect(filters).not.toMatch(/auth.uid/);
    expect(whereClauses.length).toBeGreaterThan(0);
    for (const clause of whereClauses) expect(clause, clause).not.toMatch(/author_?id|audience|status|is_?anonymous|auth\.uid|user_?id|held|is_by/i);
  });

  it('[F3.3-b1 c9] runs in the identity transaction, with no role, claims or privileged credential of its own', () => {
    const exported = [...repository.matchAll(/export\s+(?:async\s+)?function\s+\w+\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    expect(exported.length).toBeGreaterThan(0);
    for (const params of exported) expect(params, params).toMatch(/^\s*tx:\s*IdentityTx\b/);
    expect(repository).not.toMatch(/\bDatabase\b|createDatabase|postgres\(|\bdb\.(select|insert|update|delete|execute)/);
    expect(repository).not.toMatch(/set\s+(local\s+)?role|set_config|service_role|bypassrls|security\s+definer/i);
  });
});
