import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { rankingStatement, type RankingParameters } from '../src/repositories/feed-repository.js';
import { rankingProfileOf, readsViewerStages } from '../src/services/feed-service.js';

// professional-posting c5 and c14 (.work/professional-posting/spec.md; algorithm-review.md "Static-test wording", binding). Static and unit by design:
// the promise is about what the rendered ranking SQL contains, and about which files may read the account type.
const dialect = new PgDialect();
const render = (parameters: RankingParameters) => dialect.sqlToQuery(rankingStatement(parameters));
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const AS_OF = '2026-01-15T12:00:00.000000Z';
const heavy = { wFresh: 1, halfLifeHours: 24, wFriend: 2, wQuality: 0.2, qualityCap: 20, wStage: 2, scoredWindowDays: 14, pageSize: 20 };
const after = { tier: 0 as const, score: 0.5, createdAt: '2026-01-15T10:00:00.000000Z', id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };
const STAGES = ['pregnant', 'has_child'];

// The Regular profile's statement and parameters exactly as F3.2 rendered them before professional-posting: rendered from the F3.2 repository at the
// parent commit (f47606e) with the inputs above, so "byte for byte" is checked against the past, not against the present code.
const F32_SQL =
  '\n    with candidates as (\n      select p.id, p.author_id, p.is_anonymous, p.shared_post_id, p.stage_tag, p.created_at,\n             extract(epoch from ($1::timestamptz - p.created_at))::float8 / 3600::float8 as age_hours\n      from nestly.posts p\n      where p.created_at <= $2::timestamptz\n    ), tiered as (\n      select c.*, case when c.age_hours <= $3::float8 then 0 else 1 end as tier\n      from candidates c\n    ), scored as (\n      select t.id, t.author_id, t.is_anonymous, t.shared_post_id, t.created_at, t.tier,\n        case when t.tier = 1 then 0::float8 else\n          $4::float8 * power(2::float8, -t.age_hours / $5::float8)\n          + $6::float8 * (case\n              when t.is_anonymous or t.author_id is null then 0::float8\n              when exists (\n                select 1 from nestly.friendships f\n                where f.status = \'accepted\'\n                  and ((f.requester_id = (select auth.uid()) and f.addressee_id = t.author_id)\n                    or (f.addressee_id = (select auth.uid()) and f.requester_id = t.author_id))\n              ) then 1::float8 else 0::float8 end)\n          + $7::float8 * least(\n              ln(1::float8 + (\n                (select count(*) from nestly.reactions r where r.post_id = t.id and not r.is_by_author and r.created_at <= $8::timestamptz)\n                + (select count(*) from nestly.comments m where m.post_id = t.id and not m.is_by_post_author and m.created_at <= $9::timestamptz)\n              )::float8) / ln(1::float8 + $10::float8),\n              1::float8)\n          + $11::float8 * (case when t.stage_tag = any($12::text[]) then 1::float8 else 0::float8 end)\n        end as score\n      from tiered t\n    )\n    select s.id, s.author_id as "authorId", s.is_anonymous as "isAnonymous", s.shared_post_id as "sharedPostId", s.tier, s.score,\n           to_char(s.created_at at time zone \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as "createdAt"\n    from scored s\n    where (s.tier > $13::integer\n    or (s.tier = $14::integer and (s.score < $15::float8\n      or (s.score = $16::float8 and (s.created_at < $17::timestamptz\n        or (s.created_at = $18::timestamptz and s.id < $19::uuid))))))\n    order by s.tier asc, s.score desc, s.created_at desc, s.id desc\n    limit $20';
const F32_PARAMS = [
  AS_OF, AS_OF, 336, 1, 24, 2, 0.2, AS_OF, AS_OF, 20, 2, STAGES, 0, 0, 0.5, 0.5, after.createdAt, after.createdAt, after.id, 21,
];

describe('[professional-posting c14 R2] the content profile reads no social or journey data', () => {
  // A content request may still carry a Stage set in its type; the statement must not take it. It is passed through a variable so that
  // a signature without the field still compiles.
  const withStages = { profile: 'content' as const, asOf: AS_OF, config: heavy, after, stages: STAGES };
  const statements = (): string[] => [render(withStages).sql, render({ profile: 'content', asOf: AS_OF, config: heavy, after: null }).sql];

  for (const [name, pattern] of [
    ['friendships', /friendships/i],
    ['journey_contexts', /journey_contexts/i],
    ['children', /\bchildren\b/i],
    ['stage_tag', /stage_?tag/i],
    ['auth.uid', /auth\.uid/i],
  ] as const) {
    it(`[professional-posting c14] the rendered content SQL, wFriend 2 and wStage 2, holds no ${name}`, () => {
      for (const text of statements()) expect(text).not.toMatch(pattern);
    });
  }

  it('[professional-posting c14] no bound parameter of the content statement is an array; it still ranks by Freshness and Quality', () => {
    for (const query of [render(withStages), render({ profile: 'content', asOf: AS_OF, config: heavy, after: null })]) {
      expect(query.params.filter((p) => Array.isArray(p))).toEqual([]);
      expect(query.sql).toMatch(/power\(2::float8/);
      expect(query.sql).toMatch(/\bln\(/);
      expect(query.sql).toMatch(/nestly\.reactions/);
      expect(query.sql).toMatch(/order by s\.tier asc, s\.score desc, s\.created_at desc, s\.id desc/);
    }
  });

  it("[professional-posting c14] the Regular profile renders F3.2's statement and parameters byte for byte", () => {
    const query = render({ profile: 'regular', asOf: AS_OF, config: heavy, after, stages: STAGES });
    expect(query.sql).toBe(F32_SQL);
    expect(query.params).toEqual(F32_PARAMS);
  });

  it('[professional-posting c14] the check can fail: the Regular statement does hold friendships, the tag and the Stage array', () => {
    const regular = render({ profile: 'regular', asOf: AS_OF, config: heavy, after, stages: STAGES });
    expect(regular.sql).toMatch(/friendships/);
    expect(regular.sql).toMatch(/stage_tag/);
    expect(regular.params.some((p) => Array.isArray(p))).toBe(true);
  });
});

describe('[professional-posting c14 R2] profile selection', () => {
  it('[professional-posting c14] a Regular gets the regular profile, a Professional the content profile; Admin and Moderator none', () => {
    expect(rankingProfileOf('regular')).toBe('regular');
    expect(rankingProfileOf('professional')).toBe('content');
    expect(rankingProfileOf('admin')).toBeNull();
    expect(rankingProfileOf('moderator')).toBeNull();
  });

  it('[professional-posting c14] the content profile never reads the Stage, whatever wStage is; the Regular profile reads it only above 0', () => {
    for (const wStage of [0, 0.5, 1, 2]) expect(readsViewerStages('content', wStage)).toBe(false);
    expect(readsViewerStages('regular', 0)).toBe(false);
    for (const wStage of [0.5, 1, 2]) expect(readsViewerStages('regular', wStage)).toBe(true);
  });

  it('[professional-posting c14] journeys-repository reaches feed-service.ts through one readOwnStages import and one call', () => {
    const service = code(read('../src/services/feed-service.ts'));
    const imports = [...service.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*journeys-repository\.js'/g)].map((m) => (m[1] ?? '').trim());
    expect(imports).toEqual(['readOwnStages']);
    expect([...service.matchAll(/readOwnStages\(/g)]).toHaveLength(1);
  });
});

describe('[professional-posting c5 R1] the account type is read to choose a profile, never to allow or refuse a write', () => {
  for (const name of ['posts', 'comments', 'likes'] as const) {
    it(`[professional-posting c5] ${name}-repository.ts does not read account_type`, () => {
      expect(code(read(`../src/repositories/${name}-repository.ts`))).not.toMatch(/account_?type|readOwnAccounts/i);
    });
  }
  it('[professional-posting c5] posts-service.ts does not read account_type', () => {
    expect(code(read('../src/services/posts-service.ts'))).not.toMatch(/account_?type|readOwnAccounts/i);
  });
  // ORCHESTRATOR decision 19.10 (S-66, fixed in I4; F3.3 refusals unchanged per c7): these two services still refuse Admin and Moderator, the only barrier today.
  // They may read the account type for that and for nothing else: never a Regular/Professional comparison, never a row filter.
  for (const name of ['comments', 'likes'] as const) {
    it(`[professional-posting c5] ${name}-service.ts reads the account type only to refuse Admin and Moderator, never to tell a Professional from a Regular`, () => {
      const service = code(read(`../src/services/${name}-service.ts`));
      expect(service).not.toMatch(/['"](professional|regular)['"]/);
      const uses = [...service.matchAll(/accountTypes*(===|!==|==|!=)s*['"](w+)['"]/g)];
      expect(uses.length).toBeGreaterThanOrEqual(1);
      for (const use of uses) expect(['admin', 'moderator']).toContain(use[2]);
    });
  }

  it('[professional-posting c5] the feed repository (every feed SQL) does not name account_type', () => {
    expect(code(read('../src/repositories/feed-repository.ts'))).not.toMatch(/account_?type/i);
  });

  it('[professional-posting c5] the feed service reads it once, in classifyViewer, to choose the profile', () => {
    expect([...code(read('../src/services/feed-service.ts')).matchAll(/readOwnAccounts\(/g)]).toHaveLength(1);
  });
});
