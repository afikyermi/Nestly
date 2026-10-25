// Professionals and services (I11; FR-PROREG-001/002, FR-SERV-001..008, FR-SERV-011, FR-FOLLOW-001, FR-PRO-001, FR-PRO-003; migration
// 20261022400000). Runs inside the caller's identity transaction and nowhere else. Who reads a profile, a Follow, an Offer Help, a review or an
// article, and who may write one, is the database's (the I11 policies, the limit and transition triggers): nothing here narrows rows for
// permission. No statement carries the caller's id as a value: the owner columns default to auth.uid(); `(select auth.uid())` in a `where`
// picks the caller's side of a row it can already read. Counts never name who: follower_id and reviewer_id are not even readable.

import type {
  ArticleWrite,
  DirectoryQuery,
  OutreachItem,
  ProfessionalArticleItem,
  ProfessionalCard,
  ProfessionalDashboard,
  ProfessionalProfileWrite,
} from '@nestly/shared';
import {
  ARTICLE_STATUSES,
  OUTREACH_PER_DAY,
  OUTREACH_STATUSES,
  PARENT_GENDERS,
  PROFESSIONAL_AREAS,
  PROFESSIONAL_FIELDS,
  PROFESSIONAL_FIELD_LABELS,
  PROFILE_OPTIONAL_FIELDS,
} from '@nestly/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';
import { professionalConsentsInsert, usersInsert } from '../db/schema.js';

export const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
const DIRECTORY_LIMIT = 50;
/** Far above any real number of Follows; the list is not paged. */
const FOLLOWING_LIMIT = 500;
const PAGE_ARTICLES = 50;
export const EXCERPT = 160;

// ---- registration and the own profile -------------------------------------------------------------------------------------------------

const profileValues = (profile: ProfessionalProfileWrite): SQL => sql`
  ${profile.fullName}, ${profile.businessName}, ${profile.gender}, ${profile.field}, ${profile.fieldOther}, ${profile.yearsExperience},
  ${profile.area}, ${profile.about}, ${profile.priceFrom}`;

/** FR-PROREG-002: the account, its profile and the consent, in the caller's one transaction (any failure rolls all back). */
export async function insertProfessionalAccount(
  tx: IdentityTx,
  profile: ProfessionalProfileWrite,
  consent: { readonly termsVersion: string; readonly privacyVersion: string },
): Promise<void> {
  await tx.insert(usersInsert).values({ accountType: 'professional', status: 'active' });
  await tx.execute(sql`
    insert into nestly.professional_profiles (full_name, business_name, gender, field, field_other, years_experience, area, about, price_from)
    values (${profileValues(profile)})`);
  // the qualification declaration (Afik 21.10.2026) is recorded with the consent; the request requires it
  await tx.insert(professionalConsentsInsert).values({
    termsVersion: consent.termsVersion,
    privacyVersion: consent.privacyVersion,
    hasDeclared18Plus: true,
    hasDeclaredQualification: true,
  });
}

/** The caller's own account type (own row, any status): `professional`, `regular`, a staff type, or undefined with no account. */
export async function readOwnAccountType(tx: IdentityTx): Promise<string | undefined> {
  const [row] = z.array(z.object({ accountType: z.string() })).parse(await tx.execute(sql`select account_type as "accountType" from nestly.users where id = (select auth.uid())`));
  return row?.accountType;
}

/** PUT /api/professional/profile: the owner's whole editable profile. 0 when the caller has none. */
export async function updateOwnProfile(tx: IdentityTx, profile: ProfessionalProfileWrite): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.professional_profiles
    set (full_name, business_name, gender, field, field_other, years_experience, area, about, price_from) = (${profileValues(profile)})
    where user_id = (select auth.uid())
    returning 1`);
  return rows.length;
}

// ---- the directory and the profile page -----------------------------------------------------------------------------------------------

const cardRow = z.object({
  id: z.guid(),
  fullName: z.string(),
  businessName: z.string().nullable(),
  field: z.enum(PROFESSIONAL_FIELDS),
  fieldOther: z.string().nullable(),
  yearsExperience: z.number().int(),
  area: z.enum(PROFESSIONAL_AREAS).nullable(),
  priceFrom: z.number().int().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int(),
});

/** The card columns of `pp` with its rating (BR-072: the average of the reviews the caller can read, one decimal). */
const cardColumns = sql`pp.user_id as id, pp.full_name as "fullName", pp.business_name as "businessName", pp.field, pp.field_other as "fieldOther",
  pp.years_experience as "yearsExperience", pp.area, pp.price_from as "priceFrom",
  (select round(avg(r.rating)::numeric, 1)::float8 from nestly.professional_reviews r where r.professional_id = pp.user_id and r.moderation = 'active') as rating,
  (select count(*)::int from nestly.professional_reviews r where r.professional_id = pp.user_id and r.moderation = 'active') as "reviewCount"`;

/**
 * FR-SERV-001/002, FR-ALG-005: the Professionals the caller can read, filtered by field, area, minimum rating, maximum price and minimum
 * experience (AC-009), in the chosen order. `match` is the organic order: the caller's search topics (Intent Signal, a bound pattern list)
 * on the field and about text, then the rating, the profile's completeness and its freshness; never a payment (BR-047) and never verification.
 */
export async function readDirectory(
  tx: IdentityTx,
  query: DirectoryQuery,
  intents: readonly { readonly pattern: string; readonly weight: number }[],
  onlyIds?: readonly string[],
): Promise<ProfessionalCard[]> {
  const filters: SQL[] = [sql`pp.user_id <> (select auth.uid())`];
  // I13: the same filters decide whether a promoted Professional matches the page (FR-ALG-007 eligibility); the organic call passes none
  if (onlyIds !== undefined) filters.push(sql`pp.user_id = any (${sql.param([...onlyIds])}::uuid[])`);
  if (query.field !== undefined) filters.push(sql`pp.field = ${query.field}`);
  if (query.area !== undefined) filters.push(sql`pp.area = ${query.area}`);
  if (query.maxPrice !== undefined) filters.push(sql`pp.price_from <= ${query.maxPrice}`);
  if (query.minYears !== undefined) filters.push(sql`pp.years_experience >= ${query.minYears}`);
  const minRating = query.minRating ?? 0;
  const order = {
    rating: sql`x.rating desc nulls last, x."reviewCount" desc`,
    price: sql`x."priceFrom" asc nulls last`,
    experience: sql`x."yearsExperience" desc`,
    match: sql`x.score desc`,
  }[query.sort ?? 'match'];
  // the field's Hebrew name joins the matched text (a topic is in the user's words, not the field's code)
  const fieldName = sql`coalesce((${sql.param(PROFESSIONAL_FIELDS.map((field) => PROFESSIONAL_FIELD_LABELS[field]))}::text[])[array_position(${sql.param([...PROFESSIONAL_FIELDS])}::text[], pp.field)], '')`;
  const intent =
    intents.length === 0
      ? sql`0::float8`
      : sql`(select coalesce(sum(i.weight), 0::float8) from unnest(${sql.param(intents.map((x) => x.pattern))}::text[], ${sql.param(intents.map((x) => x.weight))}::float8[]) as i(pattern, weight)
             where coalesce(pp.about, '') || ' ' || coalesce(pp.field_other, '') || ' ' || ${fieldName} ~* i.pattern)`;
  return z.array(cardRow).parse(
    await tx.execute(sql`
      select x.id, x."fullName", x."businessName", x.field, x."fieldOther", x."yearsExperience", x.area, x."priceFrom", x.rating, x."reviewCount"
      from (
        select ${cardColumns},
               2 * least(1::float8, ${intent})
               + coalesce((select avg(r.rating)::float8 from nestly.professional_reviews r where r.professional_id = pp.user_id and r.moderation = 'active'), 3) / 5
               + ((pp.about is not null)::int + (pp.area is not null)::int + (pp.price_from is not null)::int + (pp.business_name is not null)::int)::float8 / 8
               + power(2::float8, -extract(epoch from (now() - pp.updated_at))::float8 / (86400 * 30)) / 4 as score
        from nestly.professional_profiles pp
        where ${sql.join(filters, sql` and `)}
      ) x
      where coalesce(x.rating, 0) >= ${minRating}
      order by ${order}, x.id
      limit ${onlyIds === undefined ? DIRECTORY_LIMIT : Math.max(onlyIds.length, 1)}`),
  );
}

const pageRow = cardRow.extend({
  gender: z.enum(PARENT_GENDERS).nullable(),
  about: z.string().nullable(),
  isMe: z.boolean(),
  isFollowing: z.boolean(),
  conversationId: z.guid().nullable(),
});

/** FR-SERV-003: one Professional's profile as the caller reads it; undefined when it cannot (inactive, blocked, unknown). */
export async function readProfessionalHead(tx: IdentityTx, id: string): Promise<z.infer<typeof pageRow> | undefined> {
  const [row] = z.array(pageRow).parse(
    await tx.execute(sql`
      select ${cardColumns}, pp.gender, pp.about, pp.user_id = (select auth.uid()) as "isMe",
             exists (select 1 from nestly.professional_follows f where f.professional_id = pp.user_id and pp.user_id <> (select auth.uid())) as "isFollowing",
             (select c.id from nestly.conversations c
               where c.user_a = least((select auth.uid()), pp.user_id) and c.user_b = greatest((select auth.uid()), pp.user_id)) as "conversationId"
      from nestly.professional_profiles pp
      where pp.user_id = ${id}::uuid`),
  );
  return row;
}

/**
 * The conversation the caller may review this Professional on (FR-SERV-011): theirs, professional or outreach, and the Professional has written in
 * it. Whether it is already reviewed cannot be read (conversation_id is not readable: it would name reviewers); a second review answers 409.
 */
export async function readReviewableConversation(tx: IdentityTx, professionalId: string): Promise<string | null> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      select c.id from nestly.conversations c
      where c.user_a = least((select auth.uid()), ${professionalId}::uuid) and c.user_b = greatest((select auth.uid()), ${professionalId}::uuid)
        and c.context in ('professional', 'outreach')
        and exists (select 1 from nestly.messages m where m.conversation_id = c.id and m.sender_id = ${professionalId}::uuid)`),
  );
  return row?.id ?? null;
}

const articleRow = z.object({
  id: z.guid(),
  title: z.string(),
  body: z.string(),
  field: z.enum(PROFESSIONAL_FIELDS),
  status: z.enum(ARTICLE_STATUSES),
  at: z.string(),
  isMine: z.boolean(),
  isTakenDown: z.boolean(),
});

/** A Professional's articles the caller can read (its own include the hidden ones), newest first. */
export async function readArticles(tx: IdentityTx, authorId: string): Promise<ProfessionalArticleItem[]> {
  return z.array(articleRow).parse(
    await tx.execute(sql`
      select a.id, a.title, a.body, a.field, a.status, to_char(a.created_at at time zone 'UTC', ${isoMs}) as at, a.author_id = (select auth.uid()) as "isMine",
             a.moderation <> 'active' as "isTakenDown"
      from nestly.professional_articles a where a.author_id = ${authorId}::uuid and (a.moderation = 'active' or a.author_id = (select auth.uid()))
      order by a.created_at desc, a.id limit ${PAGE_ARTICLES}`),
  );
}

// ---- Follow (FR-FOLLOW-001) -------------------------------------------------------------------------------------------------------------

/**
 * PG-039: the Professionals the caller follows, newest Follow first. The caller's own Follow rows are the rows it reads that do not name it
 * (follower_id is not readable to anyone; the select policy shows a follower its own rows and a Professional the rows naming it). A Professional
 * it can no longer read (inactive, blocked) is left out by the profile's policy.
 */
export async function readFollowing(tx: IdentityTx): Promise<ProfessionalCard[]> {
  return z.array(cardRow).parse(
    await tx.execute(sql`
      select ${cardColumns}
      from nestly.professional_follows f join nestly.professional_profiles pp on pp.user_id = f.professional_id
      where f.professional_id <> (select auth.uid())
      order by f.created_at desc, f.id
      limit ${FOLLOWING_LIMIT}`),
  );
}

/** Follows the Professional; a repeat is no change. A refusal propagates with its SQLSTATE (42501, 23514). */
export async function insertFollow(tx: IdentityTx, professionalId: string): Promise<void> {
  await tx.execute(sql`insert into nestly.professional_follows (professional_id) values (${professionalId}::uuid) on conflict do nothing`);
}

/** Unfollow: the caller's own row only (the delete policy). No row is the same answer. */
export async function deleteFollow(tx: IdentityTx, professionalId: string): Promise<void> {
  await tx.execute(sql`delete from nestly.professional_follows where professional_id = ${professionalId}::uuid`);
}

// ---- Offer Help (FR-SERV-005/006/008) ---------------------------------------------------------------------------------------------------

/** FR-SERV-005: one Offer Help on a post. A refusal propagates (42501 not a help post / not allowed, 23505 already sent, NS029 the limit). */
export async function insertOutreach(tx: IdentityTx, postId: string, text: string): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`insert into nestly.outreach_requests (post_id, opening_message) values (${postId}::uuid, ${text}) returning id`),
  );
  if (row === undefined) throw new Error('the outreach insert returned no row');
  return row.id;
}

const outreachRow = z.object({
  id: z.guid(),
  professionalId: z.guid(),
  professionalName: z.string().nullable(),
  field: z.enum(PROFESSIONAL_FIELDS).nullable(),
  fieldOther: z.string().nullable(),
  postId: z.guid().nullable(),
  postExcerpt: z.string().nullable(),
  text: z.string(),
  status: z.enum(OUTREACH_STATUSES),
  at: z.string(),
  conversationId: z.guid().nullable(),
});

/**
 * `received`: the Offer Help on the caller's posts (the target policy), pending first; `sent`: the caller's own (a Professional). The post's
 * text is a short excerpt; an anonymous author is never named (there is no author column at all).
 */
export async function readOutreach(tx: IdentityTx, direction: 'received' | 'sent'): Promise<OutreachItem[]> {
  const side = direction === 'sent' ? sql`o.professional_id = (select auth.uid())` : sql`o.professional_id <> (select auth.uid())`;
  return z.array(outreachRow).parse(
    await tx.execute(sql`
      select o.id, o.professional_id as "professionalId", pp.full_name as "professionalName", pp.field, pp.field_other as "fieldOther",
             o.post_id as "postId", left(p.body, ${EXCERPT}) as "postExcerpt", o.opening_message as text, o.status,
             to_char(o.created_at at time zone 'UTC', ${isoMs}) as at,
             (select c.id from nestly.conversations c
               where c.outreach_request_id = o.id
                  or (o.status = 'accepted' and o.professional_id <> (select auth.uid())
                      and c.user_a = least((select auth.uid()), o.professional_id) and c.user_b = greatest((select auth.uid()), o.professional_id))
                  or (o.status = 'accepted' and o.professional_id = (select auth.uid())
                      and c.user_a = least((select auth.uid()), p.author_id) and c.user_b = greatest((select auth.uid()), p.author_id))
               order by (c.outreach_request_id = o.id) desc nulls last limit 1) as "conversationId"
      from nestly.outreach_requests o
      left join nestly.professional_profiles pp on pp.user_id = o.professional_id
      left join nestly.posts p on p.id = o.post_id
      where ${side}
      order by (o.status = 'pending') desc, o.created_at desc, o.id
      limit 100`),
  );
}

/** The author answers a pending Offer Help; the Professional's id when it moved, undefined when nothing did (not readable, not pending). */
export async function answerOutreach(tx: IdentityTx, id: string, status: 'accepted' | 'declined'): Promise<string | undefined> {
  const [row] = z.array(z.object({ professionalId: z.guid() })).parse(
    await tx.execute(sql`
      update nestly.outreach_requests set status = ${status} where id = ${id}::uuid and status = 'pending'
      returning professional_id as "professionalId"`),
  );
  return row?.professionalId;
}

/** FR-SERV-006: the pair's conversation after an accepted Offer Help: the one they already have, else a new `outreach` one. */
export async function openOutreachConversation(tx: IdentityTx, professionalId: string, outreachId: string): Promise<string> {
  const [existing] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      select c.id from nestly.conversations c
      where c.user_a = least((select auth.uid()), ${professionalId}::uuid) and c.user_b = greatest((select auth.uid()), ${professionalId}::uuid)`),
  );
  if (existing !== undefined) return existing.id;
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.conversations (context, user_a, user_b, outreach_request_id)
      values ('outreach', least((select auth.uid()), ${professionalId}::uuid), greatest((select auth.uid()), ${professionalId}::uuid), ${outreachId}::uuid)
      returning id`),
  );
  if (row === undefined) throw new Error('the conversation insert returned no row');
  return row.id;
}

/** FR-SERV-004: a Regular opens a conversation with a Professional (no approval). A refusal propagates (42501). */
export async function openProfessionalConversation(tx: IdentityTx, professionalId: string): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.conversations (context, user_a, user_b)
      values ('professional', least((select auth.uid()), ${professionalId}::uuid), greatest((select auth.uid()), ${professionalId}::uuid))
      returning id`),
  );
  if (row === undefined) throw new Error('the conversation insert returned no row');
  return row.id;
}

/** Whether the account is a Professional the caller can read (an active profile, no user block). */
export async function isReadableProfessional(tx: IdentityTx, userId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from nestly.professional_profiles pp where pp.user_id = ${userId}::uuid and pp.user_id <> (select auth.uid())`);
  return rows.length > 0;
}

// ---- reviews and articles ---------------------------------------------------------------------------------------------------------------

export async function insertArticle(tx: IdentityTx, article: ArticleWrite): Promise<string> {
  const [row] = z.array(z.object({ id: z.guid() })).parse(
    await tx.execute(sql`
      insert into nestly.professional_articles (title, body, field, status) values (${article.title}, ${article.body}, ${article.field}, ${article.status})
      returning id`),
  );
  if (row === undefined) throw new Error('the article insert returned no row');
  return row.id;
}

/** The owner's edit (the update policy); 0 when the caller cannot edit it. */
export async function updateArticle(tx: IdentityTx, id: string, article: ArticleWrite): Promise<number> {
  const rows = await tx.execute(sql`
    update nestly.professional_articles set title = ${article.title}, body = ${article.body}, field = ${article.field}, status = ${article.status}
    where id = ${id}::uuid returning 1`);
  return rows.length;
}

export async function deleteArticle(tx: IdentityTx, id: string): Promise<number> {
  const rows = await tx.execute(sql`delete from nestly.professional_articles where id = ${id}::uuid returning 1`);
  return rows.length;
}

// ---- the Professional's home (FR-PRO-001, AC-018) ----------------------------------------------------------------------------------------

const dashboardProfileRow = z.object({
  userId: z.guid(),
  fullName: z.string(),
  field: z.enum(PROFESSIONAL_FIELDS),
  fieldOther: z.string().nullable(),
  missing: z.array(z.string()),
});

/**
 * The caller's own aggregates only (VAL-032): counts over rows its policies show, never who. Undefined with no own profile.
 * One statement per number, in this order, so Server-Timing names the slow one (after the identity entry): the profile, then followers,
 * chatStarts30d, rating, reviewCount, engagement30d, posts30d, articles, offersToday, unreadChats, acceptedOffersNew, reviewsNew,
 * offersAccepted, offersDeclined (25.10: the single statement took 0.5–8 s on Production and nothing said which part).
 */
export async function readDashboard(tx: IdentityTx): Promise<ProfessionalDashboard | undefined> {
  const [profile] = z.array(dashboardProfileRow).parse(
    await tx.execute(sql`
      select pp.user_id as "userId", pp.full_name as "fullName", pp.field, pp.field_other as "fieldOther",
        array_remove(array[case when pp.business_name is null then 'businessName' end, case when pp.gender is null then 'gender' end,
          case when pp.area is null then 'area' end, case when pp.about is null then 'about' end,
          case when pp.price_from is null then 'priceFrom' end], null) as missing
      from nestly.professional_profiles pp where pp.user_id = (select auth.uid())`),
  );
  if (profile === undefined) return undefined;
  const me = sql`(select auth.uid())`;
  const count = async (statement: SQL): Promise<number> =>
    z.array(z.object({ n: z.number().int() })).length(1).parse(await tx.execute(sql`select (${statement})::int as n`))[0]?.n ?? 0;
  const followers = await count(sql`select count(*) from nestly.professional_follows f where f.professional_id = ${me}`);
  const chatStarts30d = await count(sql`select count(*) from nestly.conversations c where ${me} in (c.user_a, c.user_b)
    and c.context in ('professional', 'outreach') and c.created_at > now() - interval '30 days'`);
  const [ratingRow] = z
    .array(z.object({ rating: z.number().nullable() }))
    .length(1)
    .parse(
      await tx.execute(sql`select (select round(avg(r.rating)::numeric, 1)::float8 from nestly.professional_reviews r
        where r.professional_id = ${me} and r.moderation = 'active') as rating`),
    );
  const reviewCount = await count(sql`select count(*) from nestly.professional_reviews r where r.professional_id = ${me} and r.moderation = 'active'`);
  const engagement30d = await count(sql`(select count(*) from nestly.reactions x join nestly.posts p on p.id = x.post_id
      where p.author_id = ${me} and not x.is_by_author and x.created_at > now() - interval '30 days')
    + (select count(*) from nestly.comments m join nestly.posts p on p.id = m.post_id
      where p.author_id = ${me} and not m.is_by_post_author and m.created_at > now() - interval '30 days')`);
  const posts30d = await count(sql`select count(*) from nestly.posts p where p.author_id = ${me} and p.created_at > now() - interval '30 days'`);
  const articles = await count(sql`select count(*) from nestly.professional_articles a where a.author_id = ${me} and a.moderation = 'active'`);
  const offersToday = await count(sql`select count(*) from nestly.outreach_requests o where o.professional_id = ${me}
    and o.created_at > now() - interval '24 hours'`);
  const unreadChats = await count(sql`select count(*) from nestly.conversations c where ${me} in (c.user_a, c.user_b)
    and exists (select 1 from nestly.messages m where m.conversation_id = c.id and m.sender_id <> ${me}
                 and m.created_at > coalesce((select r.last_read_at from nestly.chat_reads r
                                               where r.user_id = ${me} and r.conversation_id = c.id), '-infinity'))`);
  const acceptedOffersNew = await count(sql`select count(*) from nestly.outreach_requests o where o.professional_id = ${me} and o.status = 'accepted'
    and o.responded_at > now() - interval '7 days'`);
  const reviewsNew = await count(sql`select count(*) from nestly.professional_reviews r where r.professional_id = ${me} and r.moderation = 'active'
    and r.created_at > now() - interval '7 days'`);
  const offersAccepted = await count(sql`select count(*) from nestly.outreach_requests o where o.professional_id = ${me} and o.status = 'accepted'`);
  const offersDeclined = await count(sql`select count(*) from nestly.outreach_requests o where o.professional_id = ${me} and o.status = 'declined'`);
  const { missing, ...rest } = profile;
  return {
    ...rest,
    followers,
    chatStarts30d,
    rating: ratingRow?.rating ?? null,
    reviewCount,
    engagement30d,
    posts30d,
    articles,
    offersToday,
    unreadChats,
    acceptedOffersNew,
    reviewsNew,
    offersAccepted,
    offersDeclined,
    offersPerDay: OUTREACH_PER_DAY,
    profileMissing: PROFILE_OPTIONAL_FIELDS.filter((field) => missing.includes(field)),
  };
}

