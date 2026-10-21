// The analytics screen's Groups, Professionals and Marketplace numbers (FR-ADMIN-010, BR-058; SRS audit 21.10.2026). Runs in the analytics
// transaction after nameAnalytics(), so only the ANALYTICS_VIEW policies and what every active account already reads open rows here: Groups
// (groups_select_active), Public Groups' members and content (group_members_select_viewer, posts_group_hide, comments_group_hide), active
// Professionals (professional_profiles_select_viewer shows a staff caller the active ones only; user_status is not granted), reviews (professional_reviews_select_viewer) and the analytics reads of follows,
// conversations and listings (migration 20261023100000). A Private Group's members and content are not counted. Numbers only: no name, id or
// text leaves this file. Only active posts and comments count: staff keys that read more (a hidden or removed item, for a report) must never
// change a number, so every holder of ANALYTICS_VIEW reads the same ones.

import { LISTING_CATEGORIES, PROFESSIONAL_FIELDS, type AnalyticsPeriod, type AnalyticsView } from '@nestly/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const count = z.coerce.number().int();
const one = <T extends z.ZodRawShape>(shape: T) => z.array(z.object(shape)).length(1);

export type AreaAnalytics = Pick<AnalyticsView, 'groups' | 'professionals' | 'marketplace'>;

export async function readAreaAnalytics(tx: IdentityTx, days: AnalyticsPeriod): Promise<AreaAnalytics> {
  // the period starts at the start of its first day in Israel (as the rest of the screen)
  const since = sql`(date_trunc('day', now() at time zone 'Asia/Jerusalem') - make_interval(days => ${days - 1}::int)) at time zone 'Asia/Jerusalem'`;

  const [groups] = one({ public: count, private: count, created: count, members: count, joins: count, posts: count, comments: count }).parse(
    await tx.execute(sql`
      select (select count(*) from nestly.groups where status = 'active' and privacy = 'public') as public,
             (select count(*) from nestly.groups where status = 'active' and privacy = 'private') as private,
             (select count(*) from nestly.groups where status = 'active' and created_at >= ${since}) as created,
             (select count(*) from nestly.group_members m join nestly.groups g on g.id = m.group_id
               where g.status = 'active' and g.privacy = 'public' and m.member_status = 'active') as members,
             (select count(*) from nestly.group_members m join nestly.groups g on g.id = m.group_id
               where g.status = 'active' and g.privacy = 'public' and m.member_status = 'active' and m.role <> 'owner' and m.created_at >= ${since}) as joins,
             (select count(*) from nestly.posts p join nestly.groups g on g.id = p.group_id
               where g.status = 'active' and g.privacy = 'public' and p.status = 'active' and p.created_at >= ${since}) as posts,
             (select count(*) from nestly.comments c join nestly.groups g on g.id = c.group_id
               where g.status = 'active' and g.privacy = 'public' and c.status = 'active' and c.created_at >= ${since}) as comments`),
  );

  const [pros] = one({ active: count, follows: count, chats: count, reviews: count }).parse(
    await tx.execute(sql`
      select (select count(*) from nestly.professional_profiles) as active,
             (select count(*) from nestly.professional_follows where created_at >= ${since}) as follows,
             (select count(*) from nestly.conversations where context in ('professional', 'outreach') and created_at >= ${since}) as chats,
             (select count(*) from nestly.professional_reviews where moderation = 'active' and created_at >= ${since}) as reviews`),
  );
  const fields = z
    .array(z.object({ field: z.enum(PROFESSIONAL_FIELDS), count }))
    .parse(
      await tx.execute(sql`
        select field, count(*) as count from nestly.professional_profiles
        group by field order by count(*) desc, field`),
    );

  const [market] = one({ active: count, created: count, sold: count, chats: count }).parse(
    await tx.execute(sql`
      select (select count(*) from nestly.marketplace_listings l join nestly.users u on u.id = l.owner_id and u.status = 'active'
               where l.status = 'active' and not l.is_hidden and l.expires_at > now()) as active,
             (select count(*) from nestly.marketplace_listings where created_at >= ${since}) as created,
             (select count(*) from nestly.marketplace_listings where status = 'sold' and sold_at >= ${since}) as sold,
             (select count(*) from nestly.conversations where context = 'marketplace' and created_at >= ${since}) as chats`),
  );
  const categories = z
    .array(z.object({ category: z.enum(LISTING_CATEGORIES), count }))
    .parse(
      await tx.execute(sql`
        select l.category, count(*) as count from nestly.marketplace_listings l join nestly.users u on u.id = l.owner_id and u.status = 'active'
        where l.status = 'active' and not l.is_hidden and l.expires_at > now()
        group by l.category order by count(*) desc, l.category`),
    );

  return {
    groups: {
      active: { public: groups?.public ?? 0, private: groups?.private ?? 0 },
      created: groups?.created ?? 0,
      publicMembers: groups?.members ?? 0,
      publicJoins: groups?.joins ?? 0,
      publicPosts: groups?.posts ?? 0,
      publicComments: groups?.comments ?? 0,
    },
    professionals: {
      active: pros?.active ?? 0,
      byField: fields,
      follows: pros?.follows ?? 0,
      chatStarts: pros?.chats ?? 0,
      reviews: pros?.reviews ?? 0,
    },
    marketplace: { active: market?.active ?? 0, byCategory: categories, created: market?.created ?? 0, sold: market?.sold ?? 0, chats: market?.chats ?? 0 },
  };
}
