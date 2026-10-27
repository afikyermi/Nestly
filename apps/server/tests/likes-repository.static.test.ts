import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandFunctionCalls } from './helpers/sql-functions.js';

// F3.3-b2 (.work/comments-likes/spec.md c11, c12; .work/_initiatives/I3-algorithm.md "Display statement and like-state statement"), a static check by
// design: the promise is about what the repositories' text contains. Same method as comments-repository.static.test.ts.
const dir = new URL('../src/repositories/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
// Performance (27.10): a statement that runs as a plan-cached invoker function (migration 20261027400000) is read with its call: each
// `nestly.read_…(` is followed by the statement it runs, so every check below reads the same SQL as before.
const code = (text: string): string => expandFunctionCalls(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'));
const sources = new Map(files.map((f) => [f, code(readFileSync(new URL(f, dir), 'utf8'))] as const));
const statements = (text: string): string[] => text.match(/`[^`]*`/g) ?? [];
const all = [...sources.entries()].flatMap(([file, text]) => statements(text).map((statement) => ({ file, statement })));
const ownersFiles = [...sources.entries()].filter(([, text]) => /reaction_owners|reactionOwners/i.test(text));
const ownerStatements = all.filter(({ statement }) => /reaction_owners|reactionOwners/i.test(statement));

describe('[F3.3-b2 c12] reaction_owners, static', () => {
  it('[F3.3-b2 c12] reaction_owners appears in exactly one statement, in no ranking or display file besides it: the like-state statement', () => {
    expect(ownerStatements).toHaveLength(1);
    expect(ownersFiles).toHaveLength(1);
  });

  it('[F3.3-b2 c12] that statement is `select target_id from reaction_owners where target_id = any(...)`: no user_id, auth.uid, join, count or aggregation', () => {
    const statement = ownerStatements[0]?.statement ?? '';
    expect(statement).toMatch(/select\s+(?:\w+\.)?target_id\s+from\s+(?:nestly\.)?reaction_owners\b(?:\s+\w+)?\s+where\s+(?:\w+\.)?target_id\s*=\s*any\s*\(/i);
    expect(statement).not.toMatch(/user_?id|auth\.uid|\bjoin\b|count\s*\(|group\s+by|\bsum\s*\(|distinct|\blimit\b/i);
  });

  it('[F3.3-b2 c12] the like-state statement is not part of any statement that ranks or counts', () => {
    for (const { statement } of ownerStatements) expect(statement).not.toMatch(/\bposts\b|\bcomments\b|\breactions\b|friendships|algorithm_configurations|regular_names/i);
  });
});

describe('[F3.3-b2 c11] the display counts, static', () => {
  const counts = all.filter(({ statement }) => /likeCount|commentCount/.test(statement));

  it('[F3.3-b2 c11] statements exist for likeCount and commentCount (the checks below are not vacuous)', () => {
    expect(counts.some(({ statement }) => /likeCount/.test(statement) && /count\s*\(\s*\*\s*\)/i.test(statement))).toBe(true);
    expect(counts.some(({ statement }) => /commentCount/.test(statement))).toBe(true);
  });

  it('[F3.3-b2 c11] no count statement filters or reads status, liker_status, author_status, is_by_*, created_at, a user or an identity table', () => {
    for (const { file, statement } of counts) {
      expect(statement, file).not.toMatch(/\bstatus\b|liker_status|author_status|is_by_(?:author|post_author)|created_at|asOf|user_?id|author_?id|auth\.uid|post_authors|reaction_owners|post_hides|\breports\b/i);
    }
  });

  it('[F3.3-b2 c11] post_authors appears nowhere in a statement that counts, ranks or tests like-state', () => {
    for (const { file, statement } of all.filter(({ statement: s }) => /reaction_owners|likeCount|commentCount/i.test(s))) {
      expect(statement, file).not.toMatch(/post_authors/i);
    }
  });
});

describe('[F3.3-b2 c12] placement of reaction_owners in all of src, static', () => {
  const walk = (base: URL): URL[] =>
    readdirSync(base, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, base)) : e.name.endsWith('.ts') ? [new URL(e.name, base)] : []));
  const root = new URL('../src/', import.meta.url);
  const hits = walk(root).map((f) => ({ path: f.pathname, text: code(readFileSync(f, 'utf8')) })).filter(({ text }) => /\breaction_owners\b|\breactionOwners\b/.test(text));

  it('[F3.3-b2 c12] the table is named in code in likes-repository.ts only, and only inside readLikedTargetIds', () => {
    expect(hits.map((h) => h.path.split('/').pop())).toEqual(['likes-repository.ts']);
    const text = hits[0]?.text ?? '';
    const start = text.indexOf('function readLikedTargetIds');
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    const outside = text.slice(0, start) + text.slice(end);
    expect(outside).not.toMatch(/\breaction_owners\b|\breactionOwners\b/);
  });
});
