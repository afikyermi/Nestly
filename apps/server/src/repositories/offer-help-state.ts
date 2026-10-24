// The Offer Help state of a post for the caller (I11 completion C; FR-SERV-005, BR-008, §13.1-13.3), as a column of a read the caller's own
// RLS already narrows to the posts it may read. Presentation only: the database's outreach_requests_insert_professional decides again on the
// insert. NULL unless the caller is a Professional and the post is an active, non-share post of a Regular (an anonymous post is a Regular's,
// AC-130; a named post's author has no Professional profile the caller reads); then 'sent' when it already offered (one per post), else
// 'available'. Never the author's id, never another Professional's offer.

import { sql, type SQL } from 'drizzle-orm';

/** `post` is the alias of nestly.posts in the enclosing statement (a fixed identifier, never user input). */
export function offerHelpState(post: 'p'): SQL {
  const p = sql.raw(post);
  return sql`case when (select nestly.caller_account_type()) = 'professional' and not ${p}.is_share and ${p}.status = 'active'
      and (${p}.author_id is null or not exists (select 1 from nestly.professional_profiles opp where opp.user_id = ${p}.author_id))
    then case when exists (select 1 from nestly.outreach_requests oro where oro.post_id = ${p}.id and oro.professional_id = (select auth.uid()))
              then 'sent' else 'available' end
    end`;
}
