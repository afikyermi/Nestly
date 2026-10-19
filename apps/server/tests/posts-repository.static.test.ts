import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F3.1a criterion 13 (.work/post-create/spec.md), a static check by design: the promise is about what the repository's text contains.
//   - every `posts` query names its columns: no `select *`, no `returning *`, no argument-less Drizzle `.select()` / `.returning()`
//   - no `where` on author_id, audience or status: authorization is the database's (RLS), the repository filters by the row's id only
//   - queries run in the identity transaction: the repository takes an IdentityTx and never a Database, a client or a connection
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
/** Source without comments and string-free of line noise, so a word in a comment can neither fail nor pass the check. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The text inside each `.where(...)` / `where ` of the source: balanced parentheses for Drizzle, to the end of the statement for SQL. */
function whereClauses(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/\.where\(/g)) {
    let depth = 1;
    let i = (match.index ?? 0) + match[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') depth -= 1;
      i += 1;
    }
    out.push(source.slice(start, i - 1));
  }
  for (const match of source.matchAll(/\bwhere\b([^`;]*)/gi)) out.push(match[1] ?? '');
  return out;
}

const repository = code(read('../src/repositories/posts-repository.ts'));
// F3.4 c5 (.work/anonymous-post/algorithm-review.md, "Static-test wording" 2): the pinned post-detail `isMine` expression is cut out BEFORE the where-scan below,
// because the scan's regex would otherwise read the EXISTS's `where pa.author_id = (select auth.uid())`. The scan itself is unchanged.
const PINNED = /case when p\.author_id is null[\s\S]*?end as "isMine"/g;
const isMine = repository.match(PINNED) ?? [];
const scanned = repository.replace(PINNED, '');
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

describe('[F3.1-a c13] posts repository, static', () => {
  it('[F3.1-a c13] is not an empty file and queries posts', () => {
    expect(repository).toMatch(/posts/);
    expect(repository).toMatch(/\.(insert|update|select)\(/);
  });

  it('[F3.1-a c13] every query lists its columns: no select *, returning *, or argument-less select()/returning()', () => {
    expect(repository).not.toMatch(/select\s+\*/i);
    expect(repository).not.toMatch(/returning\s+\*/i);
    expect(repository).not.toMatch(/\.select\(\s*\)/);
    expect(repository).not.toMatch(/\.returning\(\s*\)/);
    expect(repository).not.toMatch(/\bposts\.\*|\bto_jsonb\(|\brow_to_json\(/i);
    expect(repository).not.toMatch(/getTableColumns/);
  });

  it('[F3.1-a c13] no where on author_id, audience or status (permission is RLS); the id is the only key', () => {
    const clauses = whereClauses(scanned);
    expect(clauses.length).toBeGreaterThan(0);
    for (const clause of clauses) {
      expect(clause, clause).not.toMatch(/author_?id|audience|status|is_?anonymous|auth\.uid|userId/i);
    }
  });

  it('[F3.1-a c13] runs in the identity transaction: every export takes an IdentityTx, none a Database, client or connection', () => {
    expect(repository).toMatch(/IdentityTx/);
    expect(repository).not.toMatch(/\bDatabase\b|createDatabase|\bclient\b|postgres\(|\bdb\.(select|insert|update|delete|execute)/);
    const exported = [...repository.matchAll(/export\s+(?:async\s+)?function\s+\w+\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    expect(exported.length).toBeGreaterThan(0);
    for (const params of exported) expect(params, params).toMatch(/^\s*tx:\s*IdentityTx\b/);
  });

  it('[F3.1-a c13] never sets a role or claims itself, and never uses a privileged credential', () => {
    expect(repository).not.toMatch(/set\s+(local\s+)?role|set_config|service_role|bypassrls/i);
  });

  // F3.4 c5 (algorithm-review.md, "Static-test wording" 1-3). The select-list expression is the A&D-approved text, whitespace aside.
  const EXPRESSION =
    'case when p.author_id is null then exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and pa.author_id = (select auth.uid())) else p.author_id = (select auth.uid()) end as "isMine"';

  it('[F3.4 c5] the post-detail isMine expression is the pinned text, in exactly one place', () => {
    expect(isMine).toHaveLength(1);
    expect(squash(isMine[0] ?? '')).toBe(EXPRESSION);
  });

  it('[F3.4 c5] the pinned match holds post_authors, exists ( and (select auth.uid()), and none of join, count(, order by, group by, limit', () => {
    for (const expression of isMine) {
      expect(expression).toMatch(/post_authors/);
      expect(expression).toMatch(/exists\s*\(/i);
      expect(expression).toMatch(/\(select auth\.uid\(\)\)/);
      expect(expression).not.toMatch(/\bjoin\b|count\s*\(|order\s+by|group\s+by|\blimit\b/i);
    }
  });

  it('[F3.4 c5] with the match cut out, posts-repository holds no post_authors (so readPost, the readability gate, keeps its columns)', () => {
    expect(scanned).not.toMatch(/post_authors/i);
  });

  it('[F3.4 c5] the expression sits in exactly one exported function, imported only by posts-service.ts and used there only by readPostById', () => {
    const starts = [...repository.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*[(<]/g)];
    const holders = starts.filter((m, i) => new RegExp(PINNED.source).test(repository.slice(m.index ?? 0, starts[i + 1]?.index ?? repository.length)));
    expect(holders).toHaveLength(1);
    const name = holders[0]?.[1] ?? '';
    expect(name).not.toBe('readPost');
    const word = new RegExp(`\b${name}\b`);
    const importers: string[] = [];
    const walk = (relative: string): void => {
      for (const entry of readdirSync(new URL(`../src/${relative}`, import.meta.url), { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${relative}${entry.name}/`);
        else if (entry.name.endsWith('.ts') && word.test(code(read(`../src/${relative}${entry.name}`)))) importers.push(`${relative}${entry.name}`);
      }
    };
    walk('');
    expect(importers.sort()).toEqual(['repositories/posts-repository.ts', 'services/posts-service.ts']);
    // In the service: everything but the import line sits inside the readPostById declaration (to the next top-level declaration).
    const service = code(read('../src/services/posts-service.ts')).replace(/import[^;]*;/g, '');
    const declaration = service.search(/(?:function|const)\s+readPostById\b/);
    expect(declaration).toBeGreaterThanOrEqual(0);
    const rest = service.slice(declaration + 1);
    const next = rest.search(/\n(?:export\s+)?(?:async\s+)?(?:function|const)\s/);
    const reader = service.slice(declaration, next < 0 ? service.length : declaration + 1 + next);
    expect(reader).toMatch(word);
    expect(service.replace(reader, '')).not.toMatch(word);
  });
});
