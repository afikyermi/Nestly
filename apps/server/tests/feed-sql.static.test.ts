import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// I3 F3.2a2 criterion 2 (.work/feed-view/spec.md; allow-list in .work/_initiatives/I3-algorithm.md -> "Feed-query allow-list"): a static
// check on the text of the feed's SQL by design. The ranking query and the display statement may name only the allow-list; eligibility
// is RLS, so no table or predicate that is an app-side copy of a policy may appear. The same words are checked again on the statements
// that really run, in tests/db/feed.db.test.ts. The viewer's own Stage read (journeys-repository, c4) is a separate statement outside feed*.ts.
const repositories = new URL('../src/repositories/', import.meta.url);
const files = readdirSync(repositories).filter((name) => /^feed.*\.ts$/.test(name));
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const source = files.map((name) => code(readFileSync(new URL(name, repositories), 'utf8'))).join('\n');
/** The one status test the allow-list grants: an accepted friendship (`f.status = 'accepted'`, Friend term only). */
const withoutFriendTest = source.replace(/\b\w+\.status\s*=\s*'accepted'/gi, '');
/** Names of common table expressions (`with x as (`, `, y as (`): they are not tables. */
const cteNames = new Set([...source.matchAll(/(?:\bwith|,)\s+([a-z_]\w*)\s+as\s*\(/gi)].map((m) => (m[1] ?? '').toLowerCase()));

const FORBIDDEN: Array<[string, RegExp]> = [
  ['post_hides', /post_hides|postHides/i],
  ['journey_contexts', /journey_contexts|journeyContexts/i],
  ['reports', /\breports\b/i],
  ['post_authors', /post_authors|postAuthors/i],
  ['reaction_owners', /reaction_owners|reactionOwners/i],
  ['held_*', /\bheld_|\bheld[A-Z]/],
  ['author_visibility / profile visibility', /author_?visibility|profile_?visibility/i],
  ['status predicates (post status, author_status, liker_status)', /\b(author_|liker_)?status\b|authorStatus|likerStatus/],
  ['is_active_account()', /is_active_account|isActiveAccount/i],
  ['select *', /select\s+\*|\.select\(\s*\)|to_jsonb\(|row_to_json\(/i],
];

/** Table names after FROM / JOIN in raw SQL (a function call such as unnest( or a sub-select is not a table). */
const tablesOf = (text: string): string[] =>
  [...text.matchAll(/\b(?:from|join)\s+([\w".]+)(?![\w".]|\s*\()/gi)].map((m) => (m[1] ?? '').replace(/"/g, '').split('.').pop() ?? '');
// I11: professional_follows (a Professional viewer's followed authors, FR-ALG-003) and professional_profiles (a Professional author's name and tag).
// I10 completion C (§11.13): group_highlights (readable by the Group's members only), groups (the pin and the "מתוך" name) and group_access
// (the caller's own Memberships) bring a Group's Highlights into its members' feed; each is read under its own policy.
const ALLOWED_TABLES = new Set(['posts', 'friendships', 'comments', 'reactions', 'algorithm_configurations', 'regular_names', 'professional_follows', 'professional_profiles',
  'group_highlights', 'groups', 'group_access']);

describe('[F3.2-a2 c2] the feed SQL, static', () => {
  it('[F3.2-a2 c2] a feed repository exists and queries posts (the check below is not vacuous)', () => {
    expect(files.length, 'no apps/server/src/repositories/feed*.ts').toBeGreaterThan(0);
    expect(source).toMatch(/posts/);
  });

  for (const [name, pattern] of FORBIDDEN) {
    it(`[F3.2-a2 c2] no ${name}`, () => {
      expect(withoutFriendTest).not.toMatch(pattern);
    });
  }

  it('[F3.2-a2 c2] no `alias.*` on a table (on a CTE of listed columns it is harmless)', () => {
    const bound = new Map<string, string>();
    for (const m of source.matchAll(/\b(?:from|join)\s+([\w".]+)\s+(?:as\s+)?([a-z_]\w*)\b/gi)) {
      bound.set((m[2] ?? '').toLowerCase(), (m[1] ?? '').replace(/"/g, '').split('.').pop()?.toLowerCase() ?? '');
    }
    const wild = [...source.matchAll(/\b([a-z_]\w*)\.\*/gi)].map((m) => (m[1] ?? '').toLowerCase()).filter((a) => !cteNames.has(bound.get(a) ?? ''));
    expect(wild).toEqual([]);
  });

  it('[F3.2-a2 c2] raw FROM / JOIN names only the allow-list tables (posts, friendships, comments, reactions, algorithm_configurations, regular_names)', () => {
    for (const table of tablesOf(source).filter((t) => !cteNames.has(t.toLowerCase()))) expect(ALLOWED_TABLES.has(table), `table ${table}`).toBe(true);
  });

  it('[F3.2-a2 c2 c5] the score arithmetic is float8: weights are cast ::float8 and nothing is cast to numeric', () => {
    expect(source).toMatch(/::float8|as\s+float8|double precision/i);
    expect(source).not.toMatch(/::numeric|as\s+numeric|::decimal/i);
    expect(source).toMatch(/::text\[\]/); // c4: the Stage set is one bound text[] parameter, never split in SQL
    expect(source).not.toMatch(/string_to_array|array_to_string/i);
  });

  it('[F3.2-a2 c7] timestamps are formatted by the database (to_char ... US) and no JS Date builds a cursor or snapshot value', () => {
    expect(source).toMatch(/to_char/i);
    expect(source).toMatch(/HH24:MI:SS\.US/);
    expect(source).not.toMatch(/new Date\(|Date\.now\(|\.toISOString\(/);
  });
});
