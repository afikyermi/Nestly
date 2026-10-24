// "בקשות עזרה" (I11 completion C; FR-SERV-005, FR-PRO-001, PG-057, §13.4): the newest posts the caller may Offer Help on whose text speaks of
// its field. Runs inside the caller's identity transaction only: the posts it may read are its own posts RLS (no Friends-only post of
// another, no Private Group it is not in, nothing it hid or reported); this read adds only what the offer's policy asks of the post (active,
// not a share, a Regular's) and the field's topic patterns (shared/search/topics.ts, the directory's matching). No author id leaves it.

import type { HelpRequestItem } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { EXCERPT, isoMs } from './professionals-repository.js';

const HELP_LIMIT = 30;

const helpRow = z.object({
  postId: z.guid(),
  excerpt: z.string(),
  isAnonymous: z.boolean(),
  authorName: z.string().nullable(),
  at: z.string(),
  offered: z.boolean(),
});

/** `patterns`: the field's topic patterns (POSIX ARE, `~*`); none = every eligible post, newest first. */
export async function readHelpRequests(tx: IdentityTx, patterns: readonly string[]): Promise<HelpRequestItem[]> {
  const topic =
    patterns.length === 0 ? sql`true` : sql`exists (select 1 from unnest(${sql.param([...patterns])}::text[]) as t(pattern) where p.body ~* t.pattern)`;
  return z.array(helpRow).parse(
    await tx.execute(sql`
      select p.id as "postId", left(p.body, ${EXCERPT}) as excerpt, p.is_anonymous as "isAnonymous", n.full_name as "authorName",
             to_char(p.created_at at time zone 'UTC', ${isoMs}) as at,
             exists (select 1 from nestly.outreach_requests o where o.post_id = p.id and o.professional_id = (select auth.uid())) as offered
      from nestly.posts p left join nestly.regular_names n on n.user_id = p.author_id
      where p.status = 'active' and not p.is_share and p.body is not null
        and (p.author_id is null or not exists (select 1 from nestly.professional_profiles pp where pp.user_id = p.author_id))
        and ${topic}
      order by p.created_at desc, p.id
      limit ${HELP_LIMIT}`),
  );
}
