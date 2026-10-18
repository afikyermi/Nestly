import { readFileSync } from 'node:fs';
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
    const clauses = whereClauses(repository);
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
});
