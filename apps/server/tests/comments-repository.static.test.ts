import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F3.3-b1 (.work/comments-likes/spec.md c3-c9; CLAUDE.md "Authorization lives in database RLS"), a static check by design: the promise is about
// what the repository's text contains. Same method as posts-repository.static.test.ts.
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const repository = code(read('../src/repositories/comments-repository.ts'));
// The one identity read is the display flag `isMine` in the select list (never a filter); it is cut out before the where scan, and pinned to that place.
const ISMINE = /case when c\.author_id is null[\s\S]*?end as "isMine"/g;
const isMine = repository.match(ISMINE) ?? [];
const filters = repository.replace(ISMINE, '');
const whereClauses = [...filters.matchAll(/\bwhere\b([^`;]*)/gi)].map((m) => m[1] ?? '');

describe('[F3.3-b1 c3 c9] comments repository, static', () => {
  it('[F3.3-b1 c3] queries comments, and every query lists its columns', () => {
    expect(repository).toMatch(/nestly\.comments/);
    expect(repository).not.toMatch(/select\s+\*/i);
    expect(repository).not.toMatch(/returning\s+\*/i);
    expect(repository).not.toMatch(/\bc\.\*|\bto_jsonb\(|\brow_to_json\(/i);
  });

  it('[F3.3-b1 c4 c9] no where on author, status, audience or identity: permission is RLS, the id or the page key is the only key', () => {
    expect(isMine.length).toBeGreaterThan(0);
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

  // F3.4 c5 replaces the F3.3-b1 c6 test (.work/anonymous-post/algorithm-review.md, "Static-test wording" 1): two pinned isMine expressions, one per repository.
  const PINNED: Record<string, RegExp> = {
    'comments-repository.ts': /case when c\.author_id is null[\s\S]*?end as "isMine"/g,
    'posts-repository.ts': /case when p\.author_id is null[\s\S]*?end as "isMine"/g,
  };

  it('[F3.4 c5] post_authors appears in the repositories only inside the two pinned isMine expressions (exists (, (select auth.uid()); no join, count(, order by, group by, limit)', () => {
    const files = readdirSync(new URL('../src/repositories/', import.meta.url)).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('comments-repository.ts');
    expect(files).toContain('posts-repository.ts');
    for (const file of files) {
      let text = code(read(`../src/repositories/${file}`));
      const pinned = PINNED[file];
      if (pinned !== undefined) {
        const matches = text.match(pinned) ?? [];
        expect(matches.length, file).toBeGreaterThan(0);
        for (const m of matches) {
          expect(m, file).toMatch(/post_authors/);
          expect(m, file).toMatch(/exists\s*\(/i);
          expect(m, file).toMatch(/\(select auth\.uid\(\)\)/);
          expect(m, file).not.toMatch(/\bjoin\b|count\s*\(|order\s+by|group\s+by|\blimit\b/i);
        }
        text = text.replace(pinned, '');
      }
      expect(text, file).not.toMatch(/post_authors/i);
    }
  });
});
