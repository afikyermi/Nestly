import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F3.5 criterion 6 (.work/share-in-feed/spec.md), a static check by design: the promise is about what the share repository's text contains.
//   - the refusals of c5 come from the database (trigger and RLS): no `where` on author_id, audience, status, author_status or is_anonymous
//   - its only extra read is a share's shared_post_id (BR-066), under the identity transaction as `authenticated`
//   - every query lists its columns
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

const repository = code(read('../src/repositories/shares-repository.ts'));

describe('[F3.5 c6] share repository, static', () => {
  it('[F3.5 c6] is not an empty file; it inserts into posts', () => {
    expect(repository).toMatch(/posts/);
    expect(repository).toMatch(/\.insert\(|insert\s+into/i);
  });

  it('[F3.5 c6] every query lists its columns: no select *, returning *, or argument-less select()/returning()', () => {
    expect(repository).not.toMatch(/select\s+\*/i);
    expect(repository).not.toMatch(/returning\s+\*/i);
    expect(repository).not.toMatch(/\.select\(\s*\)/);
    expect(repository).not.toMatch(/\.returning\(\s*\)/);
    expect(repository).not.toMatch(/\bposts\.\*|\bto_jsonb\(|\brow_to_json\(/i);
    expect(repository).not.toMatch(/getTableColumns/);
  });

  it('[F3.5 c6] no where on author_id, audience, status, author_status or is_anonymous (the refusal is the database\'s: trigger and RLS)', () => {
    for (const clause of whereClauses(repository)) {
      expect(clause, clause).not.toMatch(/author_?id|audience|\bstatus\b|author_?status|is_?anonymous|auth\.uid|userId/i);
    }
  });

  it('[F3.5 c6] its only extra read is a share\'s shared_post_id, keyed by the row id (BR-066)', () => {
    const selects = [...repository.matchAll(/\bselect\b[\s\S]*?\bfrom\b/gi)].map((m) => m[0]);
    const drizzle = [...repository.matchAll(/\.select\(([\s\S]*?)\)\s*\.from\(/g)].map((m) => m[1] ?? '');
    const lists = [...selects, ...drizzle].join(' ');
    expect(lists).toMatch(/shared_?post_?id/i);
    for (const clause of whereClauses(repository)) expect(clause, clause).toMatch(/\bid\b/i);
  });

  it('[F3.5 c6] runs in the identity transaction: every export takes an IdentityTx, none a Database, client or connection', () => {
    expect(repository).toMatch(/IdentityTx/);
    expect(repository).not.toMatch(/\bDatabase\b|createDatabase|\bclient\b|postgres\(|\bdb\.(select|insert|update|delete|execute)/);
    const exported = [...repository.matchAll(/export\s+(?:async\s+)?function\s+\w+\(([^)]*)\)/g)].map((m) => m[1] ?? '');
    expect(exported.length).toBeGreaterThan(0);
    for (const params of exported) expect(params, params).toMatch(/^\s*tx:\s*IdentityTx\b/);
  });

  it('[F3.5 c6] never sets a role or claims itself, and never uses a privileged credential', () => {
    expect(repository).not.toMatch(/set\s+(local\s+)?role|set_config|service_role|bypassrls/i);
  });
});
