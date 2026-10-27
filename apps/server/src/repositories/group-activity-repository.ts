// Organic exposure of active Groups (I10 completion C, Afik 21.10.2026 §11.14; FR-ALG-010, FR-SEARCH-001, FR-FEED-001). Runs inside the
// caller's identity transaction. A Group's activity is what the caller may read of it in the last 7 days — new posts, comments and members
// — each event weighted by its age (half-life 48 hours); fewer than 3 events lift nothing. Every count is over rows the caller's policies
// show, so a Private Group's activity is zero to a non-member: nothing about it leaks, it is simply not lifted. No paid element, no ML.

import { type FeedGroupSuggestion, GROUP_ACTIVITY_HALF_LIFE_HOURS, GROUP_ACTIVITY_MIN_EVENTS, GROUP_ACTIVITY_WINDOW_DAYS, feedGroupSuggestion } from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

/** The activity score of the Group aliased `g` in the enclosing statement (0 for a quiet Group): an ordering term, never a filter.
 * nestly.group_summaries() and nestly.feed_group_suggestions() repeat it verbatim (migration 20261027300000): change all three. */
export function groupActivityScore(): SQL {
  return sql`(select case when count(*) >= ${GROUP_ACTIVITY_MIN_EVENTS}::integer
                  then sum(power(2::float8, -(extract(epoch from (now() - e.at)) / 3600::float8) / ${GROUP_ACTIVITY_HALF_LIFE_HOURS}::float8))
                  else 0::float8 end
             from (select p.created_at as at from nestly.posts p
                    where p.group_id = g.id and p.created_at > now() - make_interval(days => ${GROUP_ACTIVITY_WINDOW_DAYS}::integer)
                   union all
                   select c.created_at from nestly.comments c
                    where c.group_id = g.id and c.created_at > now() - make_interval(days => ${GROUP_ACTIVITY_WINDOW_DAYS}::integer)
                   union all
                   select m.created_at from nestly.group_members m
                    where m.group_id = g.id and m.role <> 'owner' and m.member_status = 'active' and m.created_at > now() - make_interval(days => ${GROUP_ACTIVITY_WINDOW_DAYS}::integer)) e)`;
}

/**
 * The feed's Group unit (§11.14, ⭐ of I10-C): up to `limit` active Public Groups the caller is not a member of and is not blocked from, the
 * most active first; a quiet Group is never suggested. Basic details only (name, description, member count), never a post.
 */
export async function readFeedGroupSuggestions(tx: IdentityTx, limit: number): Promise<FeedGroupSuggestion[]> {
  // The statement is nestly.feed_group_suggestions (migration 20261027300000): a SECURITY INVOKER plpgsql function, so its plan is cached
  // per connection; it runs under the caller's policies exactly as the statement did (the activity score of groupActivityScore()).
  const rows = await tx.execute(sql`
    select s.id, s.name, s.description, s.member_count as "memberCount"
    from nestly.feed_group_suggestions(${limit}::integer, ${GROUP_ACTIVITY_MIN_EVENTS}::integer, ${GROUP_ACTIVITY_HALF_LIFE_HOURS}::float8,
                                       ${GROUP_ACTIVITY_WINDOW_DAYS}::integer) s`);
  return z.array(feedGroupSuggestion).parse(rows);
}
