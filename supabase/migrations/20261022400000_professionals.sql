-- =====================================================================================================================
-- Professionals and services — I11, migration only.
--
-- SRS: FR-REG-001 · FR-PROREG-001/002 · FR-SERV-001..008, FR-SERV-011 · FR-FOLLOW-001 · FR-PRO-001, FR-PRO-003 · FR-ALG-003, FR-ALG-005 ·
--      BR-002, BR-006..010, BR-016, BR-030, BR-051, BR-071, BR-072 · VAL-010, VAL-011, VAL-018, VAL-049 · AC-009..014, AC-018, AC-035,
--      AC-061, AC-093, AC-094, AC-130 · §12 (location from a list) · decisions-in-force.md §3 items 8-10 (no verification; Offer Help only to
--      a post that asks for help, at most 10 a day; city or area from a list) and §4 (the "followers only" audience, AC-130).
--
-- users                    users_insert_own: an identity creates its own account as a Regular or a Professional (FR-PROREG-002), active.
-- professional_profiles    a Professional's profile (FR-PROREG-001, FR-SERV-003): full name, business name, gender, field (from a list, or
--                          "other" with a short text), years of experience, area (a city or area from a list, §12), about, price from.
--                          No verification data of any kind (FR-PROREG-003 cancelled). Every active account reads the profile of an
--                          active Professional it has no user block with (the directory, FR-SERV-001/002); the owner edits its own.
-- professional_follows     Follow (FR-FOLLOW-001, BR-030, VAL-018): a Regular or a Professional follows an active Professional, never
--                          itself, never a Regular (the FK names a professional profile). The follower reads and removes its own rows;
--                          the Professional reads the rows that name it as a count only: follower_id is never granted for SELECT, so no
--                          follower identity reaches anyone (FR-PRO-001, VAL-032).
-- posts                    gain is_help_request (OP-038, default ⭐ (a): the author ticks "asking for help" when writing; Regular only)
--                          and the audience 'followers' (VAL-049, AC-130): a Professional posts to everyone or to its followers only, a
--                          Regular to everyone or Friends only. posts_select_viewer gains the follower branch.
-- outreach_requests        ProfessionalOutreachRequest — Offer Help (FR-SERV-005/006/008, BR-007..010, VAL-010, VAL-011, AC-011, AC-012,
--                          AC-014): an active Professional sends one opening message about one active post that asks for help, at most
--                          one per post ever (outreach_requests_professional_post_key) and at most 10 in 24 hours (NS029). The target is
--                          not a column: it is the post's author, so an anonymous author is never named to the Professional until they
--                          accept (FR-SERV-005). The author reads, accepts or declines; "ignore" leaves it pending. Accepting opens the
--                          conversation (context 'outreach') in the same transaction; nothing before it (AC-012).
-- conversations            gain the contexts 'professional' (a Regular opens a chat with an active Professional, no approval and no
--                          payment: FR-SERV-004, BR-006, AC-010) and 'outreach' (the author of an accepted Offer Help opens it with the
--                          Professional: FR-SERV-006/007, AC-013). Messages, reads and Chat Blocks are unchanged (I8).
-- professional_reviews     ProfessionalReview (FR-SERV-011, BR-072, AC-093): a Regular rates a Professional 1-5 with a text, once per
--                          conversation of context professional or outreach in which the Professional has answered (OP-045, default:
--                          "a request the Professional approved" = a professional conversation the Professional replied in). Every active
--                          account reads them (the profile page; the rating is their average); reviewer_id is never granted for SELECT.
-- professional_articles    ProfessionalArticle (FR-PRO-003, BR-071, AC-094): the owner writes, edits, hides and deletes its articles;
--                          every active account reads a published article of an active Professional it has no user block with.
-- No view, impression or click is recorded (usage events come later, OP-039 and §13.3): the Professional dashboard (FR-PRO-001) counts
-- product rows only — followers, conversations, reviews, articles, likes and comments.
--
-- Every new table: RLS + FORCE, client policies TO authenticated gated by is_active_account(), per-column write grants, owner columns
-- defaulting to auth.uid(). No new SECURITY DEFINER, no TO app_owner or TO app_jobs policy, no change to audit_trigger().
--
-- Error codes: NS029 the Professional sent 10 Offer Help requests in the last 24 hours (FR-SERV-008, AC-014 (b)).
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261022400000_professionals.down.sql (refuses once a new table holds a row, a Professional account exists, or a
-- post or conversation uses a new value).
-- =====================================================================================================================

-- 1. users: a Professional registers itself (FR-PROREG-002).
alter policy users_insert_own on nestly.users
  with check (id = (select auth.uid()) and account_type in ('regular', 'professional') and status = 'active');

-- 2. professional_profiles ----------------------------------------------------------------------------------------------
create table nestly.professional_profiles (
  user_id          uuid        not null default auth.uid()
    constraint professional_profiles_pkey primary key,
  account_type     text        not null default 'professional'
    constraint professional_profiles_account_type_check check (account_type = 'professional'),
  user_status      text        not null default 'active',
  full_name        text        not null
    constraint professional_profiles_full_name_check check (pg_catalog.char_length(pg_catalog.btrim(full_name)) between 2 and 60),
  business_name    text
    constraint professional_profiles_business_name_check check (business_name is null or pg_catalog.char_length(pg_catalog.btrim(business_name)) between 2 and 80),
  gender           text
    constraint professional_profiles_gender_check check (gender in ('woman', 'man', 'other', 'prefer_not_to_say')),
  field            text        not null
    constraint professional_profiles_field_check check (field in ('doula', 'midwife', 'lactation', 'sleep', 'nutrition', 'pediatric_physio',
      'pelvic_physio', 'psychology', 'parenting', 'child_development', 'speech', 'occupational', 'fertility', 'photography', 'other')),
  field_other      text,
  years_experience smallint    not null
    constraint professional_profiles_years_experience_check check (years_experience between 0 and 60),
  area             text
    constraint professional_profiles_area_check check (area in ('jerusalem', 'tel_aviv', 'center', 'sharon', 'shfela', 'haifa', 'north',
      'south', 'beer_sheva', 'eilat', 'judea_samaria')),
  about            text
    constraint professional_profiles_about_check check (about is null or (about ~ '[^[:space:]]' and pg_catalog.char_length(about) <= 1000)),
  price_from       integer
    constraint professional_profiles_price_from_check check (price_from between 0 and 100000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint professional_profiles_field_other_check check (
    (field = 'other') = (field_other is not null)
    and (field_other is null or pg_catalog.char_length(pg_catalog.btrim(field_other)) between 2 and 40)),
  constraint professional_profiles_user_fkey foreign key (user_id, account_type)
    references nestly.users (id, account_type) on delete cascade,
  constraint professional_profiles_user_status_fkey foreign key (user_id, user_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index professional_profiles_field_idx on nestly.professional_profiles (field) where user_status = 'active';
create index professional_profiles_area_idx on nestly.professional_profiles (area) where user_status = 'active';

-- 3. professional_follows ----------------------------------------------------------------------------------------------
create table nestly.professional_follows (
  id              uuid        not null default gen_random_uuid()
    constraint professional_follows_pkey primary key,
  follower_id     uuid        not null default auth.uid(),
  follower_status text        not null default 'active',
  professional_id uuid        not null
    constraint professional_follows_professional_id_fkey references nestly.professional_profiles (user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint professional_follows_self_check check (follower_id <> professional_id),
  constraint professional_follows_pair_key unique (follower_id, professional_id),
  constraint professional_follows_follower_status_fkey foreign key (follower_id, follower_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index professional_follows_professional_id_idx on nestly.professional_follows (professional_id);

-- 4. posts: Offer Help marking (OP-038 ⭐ (a)) and the followers-only audience (VAL-049, AC-130). Constant default: catalog only.
alter table nestly.posts add column is_help_request boolean not null default false;
alter table nestly.posts add constraint posts_help_request_check check (not (is_help_request and is_share));
alter table nestly.posts drop constraint posts_audience_value_check;
alter table nestly.posts add constraint posts_audience_value_check check (audience in ('everyone', 'friends', 'followers'));
alter table nestly.posts drop constraint posts_audience_check;
alter table nestly.posts add constraint posts_audience_check check (not is_anonymous or audience = 'everyone');
create index posts_help_request_created_idx on nestly.posts (created_at desc) where is_help_request and status = 'active';

-- 5. outreach_requests -------------------------------------------------------------------------------------------------
create table nestly.outreach_requests (
  id                  uuid        not null default gen_random_uuid()
    constraint outreach_requests_pkey primary key,
  professional_id     uuid        not null default auth.uid()
    constraint outreach_requests_professional_id_fkey references nestly.professional_profiles (user_id) on delete cascade,
  professional_status text        not null default 'active',
  post_id             uuid
    constraint outreach_requests_post_id_fkey references nestly.posts (id) on delete set null,
  opening_message     text        not null
    constraint outreach_requests_opening_message_check check (pg_catalog.char_length(opening_message) between 1 and 2000 and opening_message ~ '[^[:space:]]'),
  status              text        not null default 'pending'
    constraint outreach_requests_status_check check (status in ('pending', 'accepted', 'declined')),
  created_at          timestamptz not null default now(),
  responded_at        timestamptz,
  constraint outreach_requests_responded_at_check check ((responded_at is null) = (status = 'pending')),
  constraint outreach_requests_professional_post_key unique (professional_id, post_id),
  constraint outreach_requests_professional_status_fkey foreign key (professional_id, professional_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index outreach_requests_post_id_idx on nestly.outreach_requests (post_id) where post_id is not null;
create index outreach_requests_professional_created_idx on nestly.outreach_requests (professional_id, created_at);

-- 6. conversations: the Professional contexts.
alter table nestly.conversations add column outreach_request_id uuid
  constraint conversations_outreach_request_id_fkey references nestly.outreach_requests (id) on delete cascade;
alter table nestly.conversations drop constraint conversations_context_check;
alter table nestly.conversations add constraint conversations_context_check check (context in ('friends', 'request', 'professional', 'outreach'));
alter table nestly.conversations add constraint conversations_outreach_request_id_check check ((context = 'outreach') = (outreach_request_id is not null));
create index conversations_outreach_request_id_idx on nestly.conversations (outreach_request_id) where outreach_request_id is not null;

-- 7. professional_reviews ----------------------------------------------------------------------------------------------
create table nestly.professional_reviews (
  id              uuid        not null default gen_random_uuid()
    constraint professional_reviews_pkey primary key,
  reviewer_id     uuid        not null default auth.uid(),
  reviewer_status text        not null default 'active',
  professional_id uuid        not null
    constraint professional_reviews_professional_id_fkey references nestly.professional_profiles (user_id) on delete cascade,
  conversation_id uuid        not null
    constraint professional_reviews_conversation_id_fkey references nestly.conversations (id) on delete cascade,
  rating          smallint    not null
    constraint professional_reviews_rating_check check (rating between 1 and 5),
  body            text        not null
    constraint professional_reviews_body_check check (pg_catalog.char_length(body) between 1 and 1000 and body ~ '[^[:space:]]'),
  created_at      timestamptz not null default now(),
  constraint professional_reviews_conversation_key unique (conversation_id),
  constraint professional_reviews_self_check check (reviewer_id <> professional_id),
  constraint professional_reviews_reviewer_status_fkey foreign key (reviewer_id, reviewer_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index professional_reviews_professional_created_idx on nestly.professional_reviews (professional_id, created_at desc);
create index professional_reviews_reviewer_id_idx on nestly.professional_reviews (reviewer_id);

-- 8. professional_articles ---------------------------------------------------------------------------------------------
create table nestly.professional_articles (
  id            uuid        not null default gen_random_uuid()
    constraint professional_articles_pkey primary key,
  author_id     uuid        not null default auth.uid()
    constraint professional_articles_author_id_fkey references nestly.professional_profiles (user_id) on delete cascade,
  author_status text        not null default 'active',
  title         text        not null
    constraint professional_articles_title_check check (pg_catalog.char_length(pg_catalog.btrim(title)) between 2 and 120),
  body          text        not null
    constraint professional_articles_body_check check (pg_catalog.char_length(body) between 1 and 10000 and body ~ '[^[:space:]]'),
  field         text        not null
    constraint professional_articles_field_check check (field in ('doula', 'midwife', 'lactation', 'sleep', 'nutrition', 'pediatric_physio',
      'pelvic_physio', 'psychology', 'parenting', 'child_development', 'speech', 'occupational', 'fertility', 'photography', 'other')),
  status        text        not null default 'published'
    constraint professional_articles_status_check check (status in ('published', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint professional_articles_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

create index professional_articles_author_created_idx on nestly.professional_articles (author_id, created_at desc);

-- 10. Triggers (SECURITY INVOKER; auth.uid() is the actor).

-- professional_profiles: the owner edits its fields; the key, the type and the clocks are the database's.
create function nestly.professional_profiles_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.user_id, new.account_type, new.created_at) is distinct from (old.user_id, old.account_type, old.created_at) then
    raise exception 'professional_profiles: immutable column' using errcode = '42501';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- outreach_requests: at most 10 new requests per Professional in 24 hours (FR-SERV-008, AC-014 (b)), every status counted. The
-- Professional always reads its own rows, so nothing hides one from the count; the advisory lock, keyed on the Professional, makes
-- concurrent inserts count one after the other (read committed only, as the I8 limits).
create function nestly.outreach_requests_insert_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'outreach_requests: the daily limit needs a read committed transaction' using errcode = '25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(8111, pg_catalog.hashtext(new.professional_id::text));
  if (select pg_catalog.count(*) from nestly.outreach_requests o
       where o.professional_id = new.professional_id and o.created_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'outreach_requests: too many Offer Help requests in 24 hours' using errcode = 'NS029';
  end if;
  return new;
end
$$;

-- outreach_requests: the post's author answers a pending request once (accept or decline, VAL-011); the Professional never moves it.
create function nestly.outreach_requests_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.professional_id, new.opening_message, new.created_at)
     is distinct from (old.id, old.professional_id, old.opening_message, old.created_at)
     or (new.post_id is distinct from old.post_id and new.post_id is not null) then
    raise exception 'outreach_requests: immutable column' using errcode = '42501';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'pending' and new.status in ('accepted', 'declined') and auth.uid() is distinct from old.professional_id then
    new.responded_at := pg_catalog.now();
    return new;
  end if;
  raise exception 'outreach_requests: transition refused' using errcode = '42501';
end
$$;

-- professional_articles: the owner edits title, body, field and status; the author and the clocks are the database's.
create function nestly.professional_articles_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.id, new.author_id, new.created_at) is distinct from (old.id, old.author_id, old.created_at) then
    raise exception 'professional_articles: immutable column' using errcode = '42501';
  end if;
  if (new.title, new.body, new.field, new.status) is distinct from (old.title, old.body, old.field, old.status) then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end
$$;

revoke execute on function nestly.professional_profiles_update_guard() from public;
revoke execute on function nestly.outreach_requests_insert_limit() from public;
revoke execute on function nestly.outreach_requests_transition() from public;
revoke execute on function nestly.professional_articles_update_guard() from public;

create trigger professional_profiles_update_guard before update on nestly.professional_profiles
  for each row execute function nestly.professional_profiles_update_guard();
create trigger outreach_requests_insert_limit before insert on nestly.outreach_requests
  for each row execute function nestly.outreach_requests_insert_limit();
create trigger outreach_requests_transition before update on nestly.outreach_requests
  for each row execute function nestly.outreach_requests_transition();
create trigger professional_articles_update_guard before update on nestly.professional_articles
  for each row execute function nestly.professional_articles_update_guard();

-- 11. RLS, grants and policies.
alter table nestly.professional_profiles enable row level security, force row level security;
alter table nestly.professional_follows enable row level security, force row level security;
alter table nestly.outreach_requests enable row level security, force row level security;
alter table nestly.professional_reviews enable row level security, force row level security;
alter table nestly.professional_articles enable row level security, force row level security;

revoke all on table nestly.professional_profiles, nestly.professional_follows, nestly.outreach_requests, nestly.professional_reviews,
  nestly.professional_articles from public, anon, authenticated;

-- The status copies and the identities behind counts (follower, reviewer, viewer) are never granted for SELECT: the policies read them.
grant select (user_id, account_type, full_name, business_name, gender, field, field_other, years_experience, area, about, price_from,
  created_at, updated_at) on table nestly.professional_profiles to authenticated;
grant insert (full_name, business_name, gender, field, field_other, years_experience, area, about, price_from),
  update (full_name, business_name, gender, field, field_other, years_experience, area, about, price_from)
  on table nestly.professional_profiles to authenticated;
grant select (id, professional_id, created_at) on table nestly.professional_follows to authenticated;
grant insert (professional_id), delete on table nestly.professional_follows to authenticated;
grant select (is_help_request), insert (is_help_request), update (is_help_request) on table nestly.posts to authenticated;
grant select (id, professional_id, post_id, opening_message, status, created_at, responded_at) on table nestly.outreach_requests to authenticated;
grant insert (post_id, opening_message), update (status) on table nestly.outreach_requests to authenticated;
grant insert (outreach_request_id) on table nestly.conversations to authenticated;
grant select (id, professional_id, conversation_id, rating, body, created_at) on table nestly.professional_reviews to authenticated;
grant insert (professional_id, conversation_id, rating, body) on table nestly.professional_reviews to authenticated;
grant select (id, author_id, title, body, field, status, created_at, updated_at) on table nestly.professional_articles to authenticated;
grant insert (title, body, field, status), update (title, body, field, status), delete on table nestly.professional_articles to authenticated;

-- professional_profiles.
create policy professional_profiles_select_viewer on nestly.professional_profiles
  for select to authenticated
  using ((select nestly.is_active_account()) and (user_id = (select auth.uid())
    or (user_status = 'active' and user_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

create policy professional_profiles_insert_own on nestly.professional_profiles
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid())
    and (select nestly.caller_account_type()) = 'professional');

create policy professional_profiles_update_own on nestly.professional_profiles
  for update to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()));

-- professional_follows. The follower: its own rows; the Professional: the rows that name it while the follower is active (a count).
create policy professional_follows_select_party on nestly.professional_follows
  for select to authenticated
  using ((select nestly.is_active_account()) and (follower_id = (select auth.uid())
    or (professional_id = (select auth.uid()) and follower_status = 'active')));

create policy professional_follows_insert_follower on nestly.professional_follows
  for insert to authenticated
  with check ((select nestly.is_active_account()) and follower_id = (select auth.uid()) and follower_status = 'active'
    and (select nestly.caller_account_type()) in ('regular', 'professional')
    and exists (select 1 from nestly.professional_profiles pp
                 where pp.user_id = professional_follows.professional_id));

create policy professional_follows_delete_follower on nestly.professional_follows
  for delete to authenticated
  using ((select nestly.is_active_account()) and follower_id = (select auth.uid()));

-- posts. A Regular writes to everyone or Friends and may mark a post as asking for help; a Professional writes named, to everyone or its
-- followers, with no stage tag and no help marking (VAL-049, AC-130). The rest is the text of 20261019400000.
drop policy posts_insert_author on nestly.posts;
create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and not is_anonymous and audience in ('everyone', 'followers') and stage_tag is null and not is_help_request)));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid())))
    and (((select nestly.caller_account_type()) = 'regular' and audience in ('everyone', 'friends'))
      or ((select nestly.caller_account_type()) = 'professional'
        and audience in ('everyone', 'followers') and stage_tag is null and not is_help_request)));

-- posts_select_viewer gains one branch (AC-130): a followers-only post is read by the Professional's followers. The rest is the text of
-- 20261018200000. The EXISTS runs under the caller's own professional_follows policy, which shows it its own Follows and, to a
-- Professional, the rows naming it: so a row naming the author means "the caller follows the author" or "the caller is the author" (who
-- reads its own post anyway). follower_id is not named: it is not granted for SELECT to anyone. The same holds for the
-- professional_profiles reads below: a profile row other than one's own is readable only while the Professional is active.
drop policy posts_select_viewer on nestly.posts;
create policy posts_select_viewer on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (status = 'active' and author_status = 'active'
      and (audience = 'everyone'
        or author_id = (select auth.uid())
        or (audience = 'friends' and exists (
          select 1 from nestly.friendships f
          where f.status = 'accepted' and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = posts.author_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = posts.author_id))))
        or (audience = 'followers' and exists (
          select 1 from nestly.professional_follows pf where pf.professional_id = posts.author_id)))
      and not exists (
        select 1 from nestly.post_hides h where h.user_id = (select auth.uid()) and h.post_id = posts.id)
      and not exists (
        select 1 from nestly.reports r where r.reporter_id = (select auth.uid()) and r.post_id = posts.id))
    or (status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned() and (
      author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))));

-- outreach_requests. The Professional reads its own; the post's author (named, or through post_authors) reads the requests on its posts
-- while the Professional is active and no user block stands between them.
create policy outreach_requests_select_professional on nestly.outreach_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and professional_id = (select auth.uid()));

create policy outreach_requests_select_target on nestly.outreach_requests
  for select to authenticated
  using ((select nestly.is_active_account()) and professional_status = 'active'
    and professional_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and exists (select 1 from nestly.posts p where p.id = outreach_requests.post_id
                 and (p.author_id = (select auth.uid())
                   or exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and pa.author_id = (select auth.uid())))));

-- An active Professional offers help on an active post it can read that asks for help (only a Regular's post can), named or anonymous,
-- never across a user block with a named author (VAL-010, BR-007, BR-009). One per post and 10 a day: the key and NS029.
create policy outreach_requests_insert_professional on nestly.outreach_requests
  for insert to authenticated
  with check ((select nestly.is_active_account()) and professional_id = (select auth.uid()) and professional_status = 'active'
    and status = 'pending' and (select nestly.caller_account_type()) = 'professional'
    and exists (select 1 from nestly.posts p where p.id = outreach_requests.post_id
                 and p.status = 'active' and p.is_help_request and not p.is_share
                 and (p.author_id is null or p.author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

-- The author answers a pending request: a decline always passes; an accept needs an active Professional and no Chat Block between them
-- (the user block is already in the USING through the select policy's terms).
create policy outreach_requests_update_target on nestly.outreach_requests
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'pending' and professional_status = 'active'
    and professional_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and exists (select 1 from nestly.posts p where p.id = outreach_requests.post_id
                 and (p.author_id = (select auth.uid())
                   or exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and pa.author_id = (select auth.uid())))))
  with check ((select nestly.is_active_account()) and professional_id <> (select auth.uid())
    and (status = 'declined'
      or (status = 'accepted' and professional_status = 'active'
          and not exists (select 1 from nestly.chat_blocks b where b.lifted_at is null
                           and ((b.blocker_id = (select auth.uid()) and b.blocked_id = outreach_requests.professional_id)
                             or (b.blocked_id = (select auth.uid()) and b.blocker_id = outreach_requests.professional_id))))));

-- conversations. As 20261022100000, plus: a Regular opens one with an active Professional (FR-SERV-004, no approval), and the author of
-- an accepted Offer Help opens it with that Professional (FR-SERV-006; the request is readable to it only as the post's author).
drop policy conversations_insert_party on nestly.conversations;
create policy conversations_insert_party on nestly.conversations
  for insert to authenticated
  with check ((select nestly.is_active_account()) and (select auth.uid()) in (user_a, user_b)
    and a_status = 'active' and b_status = 'active'
    and (case when user_a = (select auth.uid()) then user_b else user_a end) <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[]))
    and ((context = 'friends' and exists (
           select 1 from nestly.friendships f where f.status = 'accepted'
            and least(f.requester_id, f.addressee_id) = conversations.user_a and greatest(f.requester_id, f.addressee_id) = conversations.user_b))
      or (context = 'request' and exists (
           select 1 from nestly.chat_requests r where r.id = conversations.chat_request_id and r.status = 'accepted'
            and least(r.requester_id, r.target_id) = conversations.user_a and greatest(r.requester_id, r.target_id) = conversations.user_b))
      or (context = 'professional' and (select nestly.caller_account_type()) = 'regular' and exists (
           select 1 from nestly.professional_profiles pp
            where pp.user_id =(case when conversations.user_a = (select auth.uid()) then conversations.user_b else conversations.user_a end)))
      or (context = 'outreach' and exists (
           select 1 from nestly.outreach_requests o where o.id = conversations.outreach_request_id and o.status = 'accepted'
            and o.professional_id <> (select auth.uid())
            and least(o.professional_id, (select auth.uid())) = conversations.user_a
            and greatest(o.professional_id, (select auth.uid())) = conversations.user_b))));

-- professional_reviews. Every active account reads the reviews of an active reviewer it has no user block with; a Regular reviews a
-- Professional once per professional conversation in which the Professional has written (FR-SERV-011, OP-045).
create policy professional_reviews_select_viewer on nestly.professional_reviews
  for select to authenticated
  using ((select nestly.is_active_account()) and (reviewer_id = (select auth.uid())
    or (reviewer_status = 'active' and reviewer_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

create policy professional_reviews_insert_reviewer on nestly.professional_reviews
  for insert to authenticated
  with check ((select nestly.is_active_account()) and reviewer_id = (select auth.uid()) and reviewer_status = 'active'
    and (select nestly.caller_account_type()) = 'regular'
    and exists (select 1 from nestly.conversations c where c.id = professional_reviews.conversation_id
                 and c.context in ('professional', 'outreach')
                 and professional_reviews.professional_id in (c.user_a, c.user_b)
                 and exists (select 1 from nestly.messages m
                              where m.conversation_id = c.id and m.sender_id = professional_reviews.professional_id)));

-- professional_articles.
create policy professional_articles_select_viewer on nestly.professional_articles
  for select to authenticated
  using ((select nestly.is_active_account()) and (author_id = (select auth.uid())
    or (status = 'published' and author_status = 'active'
        and author_id <> all (coalesce((select nestly.block_peer_ids()), '{}'::uuid[])))));

create policy professional_articles_insert_own on nestly.professional_articles
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_id = (select auth.uid()) and author_status = 'active'
    and (select nestly.caller_account_type()) = 'professional');

create policy professional_articles_update_own on nestly.professional_articles
  for update to authenticated
  using ((select nestly.is_active_account()) and author_id = (select auth.uid()))
  with check ((select nestly.is_active_account()) and author_id = (select auth.uid()));

create policy professional_articles_delete_own on nestly.professional_articles
  for delete to authenticated
  using ((select nestly.is_active_account()) and author_id = (select auth.uid()));


-- 12. Comments.
comment on policy users_insert_own on nestly.users is
  'An identity creates its own account, as a Regular or a Professional (FR-PROREG-002, I11), active only (platform rule 14). Admin and Moderator accounts are never self-created.';

comment on table nestly.professional_profiles is
  'SRS ProfessionalProfile (§13, FR-PROREG-001, FR-SERV-003): a Professional''s public profile. No verification data (FR-PROREG-003 cancelled, OP-005). Read by every active account while the Professional is active and no user block stands between them; written by its owner only.';
comment on column nestly.professional_profiles.user_id is 'The Professional account, = users.id (default auth.uid(), rule 12).';
comment on column nestly.professional_profiles.account_type is 'Always professional: with the composite FK to users (id, account_type) only a Professional holds this profile (BR-016).';
comment on column nestly.professional_profiles.user_status is 'Copy of users.status kept by the FK (ON UPDATE CASCADE): the policies hide a suspended or banned Professional. Never granted.';
comment on column nestly.professional_profiles.full_name is 'FR-PROREG-001: full name, 2 to 60 characters after trimming (VAL-001 counting).';
comment on column nestly.professional_profiles.business_name is 'FR-PROREG-001: business name, optional, 2 to 80 characters after trimming.';
comment on column nestly.professional_profiles.gender is 'FR-PROREG-001: woman, man, other or prefer_not_to_say (VAL-006); NULL = not answered.';
comment on column nestly.professional_profiles.field is 'FR-PROREG-001: the field, from the list in packages/shared (the SRS list is TBD; default list, I11); other = free text in field_other.';
comment on column nestly.professional_profiles.field_other is 'The free-text field when field is other, 2 to 40 characters; NULL otherwise.';
comment on column nestly.professional_profiles.years_experience is 'FR-PROREG-001: years of experience, 0 to 60. A directory filter (FR-SERV-002).';
comment on column nestly.professional_profiles.area is 'FR-SERV-002, §12: a city or area from the list in packages/shared, no GPS and no map (Afik 18.10.2026); NULL = not given.';
comment on column nestly.professional_profiles.about is 'FR-SERV-003: the services and about text, optional, up to 1000 characters.';
comment on column nestly.professional_profiles.price_from is 'FR-SERV-002: the starting price in whole shekels, optional (a directory filter). Not a payment.';
comment on column nestly.professional_profiles.created_at is 'When the profile was created. UTC.';
comment on column nestly.professional_profiles.updated_at is 'The last edit, the database clock (professional_profiles_update_guard). A freshness signal (FR-ALG-005).';
comment on index nestly.professional_profiles_field_idx is 'The directory by field (FR-SERV-001).';
comment on index nestly.professional_profiles_area_idx is 'The directory by area (FR-SERV-002).';

comment on table nestly.professional_follows is
  'SRS ProfessionalFollow (§13, FR-FOLLOW-001, BR-030, VAL-018): one-way, toward a Professional profile only, never oneself. The follower reads and removes its rows; the Professional reads the rows that name it as a count (follower_id is not granted).';
comment on column nestly.professional_follows.id is 'The row id.';
comment on column nestly.professional_follows.follower_id is 'The follower, a Regular or Professional account (default auth.uid()). Never granted for SELECT: no follower identity reaches anyone (FR-PRO-001, VAL-032).';
comment on column nestly.professional_follows.follower_status is 'Copy of the follower''s users.status (FK, ON UPDATE CASCADE): a suspended follower is not counted. Never granted.';
comment on column nestly.professional_follows.professional_id is 'The followed Professional: the FK to professional_profiles makes a Follow to a Regular impossible (AC-035).';
comment on column nestly.professional_follows.created_at is 'When the Follow was made. UTC.';
comment on index nestly.professional_follows_professional_id_idx is 'A Professional''s follower count; the followers-only post check.';

comment on column nestly.posts.is_help_request is 'OP-038 (default ⭐ (a), I11): the author marked the post as asking for help, so Professionals may Offer Help (FR-SERV-005). Regular posts only (posts_insert_author); never a share.';
comment on column nestly.posts.audience is 'VAL-049: everyone or friends (Regular), everyone or followers (Professional, AC-130). An anonymous post is everyone only.';
comment on index nestly.posts_help_request_created_idx is 'Help-request posts, newest first (the Professional''s home).';

comment on table nestly.outreach_requests is
  'SRS ProfessionalOutreachRequest (§13, FR-SERV-005/006/008, BR-007..010, VAL-010/011): a Professional''s Offer Help on a post that asks for help. One per Professional and post, at most 10 in 24 hours (NS029). The target is the post''s author, never stored: an anonymous author stays unknown to the Professional until it accepts.';
comment on column nestly.outreach_requests.id is 'The request id.';
comment on column nestly.outreach_requests.professional_id is 'The Professional (default auth.uid()).';
comment on column nestly.outreach_requests.professional_status is 'Copy of the Professional''s users.status (FK, ON UPDATE CASCADE): a suspended Professional''s requests are hidden from the author and cannot be accepted. Never granted.';
comment on column nestly.outreach_requests.post_id is 'The post that asked for help. SET NULL when the post is purged: the request then stays only with the Professional.';
comment on column nestly.outreach_requests.opening_message is 'The first message, 1 to 2000 characters (as a chat message). Shown to the author with the request; never copied elsewhere.';
comment on column nestly.outreach_requests.status is 'pending, accepted or declined (VAL-011). "Ignore" leaves it pending. Only accepted opens a conversation (AC-012).';
comment on column nestly.outreach_requests.created_at is 'When the request was sent; the 24-hour count of NS029.';
comment on column nestly.outreach_requests.responded_at is 'When the author answered, the database clock; NULL exactly while pending.';
comment on constraint outreach_requests_professional_post_key on nestly.outreach_requests is 'BR-008, AC-014 (a): one request per Professional and post, ever (a declined one included).';
comment on index nestly.outreach_requests_post_id_idx is 'The requests on a post (the author''s list).';
comment on index nestly.outreach_requests_professional_created_idx is 'The Professional''s 24-hour count (NS029).';

comment on column nestly.conversations.context is 'friends, request (I8), professional (a Regular opened it with a Professional, FR-SERV-004) or outreach (an accepted Offer Help, FR-SERV-006).';
comment on column nestly.conversations.outreach_request_id is 'The accepted Offer Help this conversation came from; set exactly on context outreach.';
comment on index nestly.conversations_outreach_request_id_idx is 'The conversation of an accepted Offer Help.';

comment on table nestly.professional_reviews is
  'SRS ProfessionalReview (§13, FR-SERV-011, BR-072, AC-093): a Regular''s 1-5 rating and text of a Professional, once per professional conversation in which the Professional wrote (OP-045 default). Immutable. Read by every active account; the reviewer is never granted for SELECT.';
comment on column nestly.professional_reviews.id is 'The review id.';
comment on column nestly.professional_reviews.reviewer_id is 'The Regular reviewer (default auth.uid()). Never granted for SELECT.';
comment on column nestly.professional_reviews.reviewer_status is 'Copy of the reviewer''s users.status (FK): a suspended reviewer''s review is hidden. Never granted.';
comment on column nestly.professional_reviews.professional_id is 'The reviewed Professional.';
comment on column nestly.professional_reviews.conversation_id is 'The conversation the review rests on: one review per conversation (the "approved request", OP-045).';
comment on column nestly.professional_reviews.rating is '1 to 5. The Professional''s rating is the average (BR-072).';
comment on column nestly.professional_reviews.body is 'The review text, 1 to 1000 characters. The writer is responsible for it (BR-071).';
comment on column nestly.professional_reviews.created_at is 'When the review was written. UTC.';
comment on index nestly.professional_reviews_professional_created_idx is 'A Professional''s reviews, newest first; the average.';
comment on index nestly.professional_reviews_reviewer_id_idx is 'The reviewer''s rows (status cascade, cleanup).';

comment on table nestly.professional_articles is
  'SRS ProfessionalArticle (§13, FR-PRO-003, BR-071, AC-094): a Professional''s article in its field. Only the owner writes, edits, hides or deletes it; every active account reads a published one of an active author with no user block between them.';
comment on column nestly.professional_articles.id is 'The article id.';
comment on column nestly.professional_articles.author_id is 'The Professional (default auth.uid()).';
comment on column nestly.professional_articles.author_status is 'Copy of the author''s users.status (FK): a suspended author''s articles are hidden. Never granted.';
comment on column nestly.professional_articles.title is 'The title, 2 to 120 characters after trimming.';
comment on column nestly.professional_articles.body is 'The text, 1 to 10000 characters.';
comment on column nestly.professional_articles.field is 'The field (same list as professional_profiles.field).';
comment on column nestly.professional_articles.status is 'published or hidden (by its owner).';
comment on column nestly.professional_articles.created_at is 'When the article was written. UTC.';
comment on column nestly.professional_articles.updated_at is 'The last edit of its content or status, the database clock.';
comment on index nestly.professional_articles_author_created_idx is 'A Professional''s articles, newest first.';


comment on function nestly.professional_profiles_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The key, the type and created_at do not change; updated_at is the database clock.';
comment on function nestly.outreach_requests_insert_limit() is 'BEFORE INSERT, SECURITY INVOKER. At most 10 Offer Help requests per Professional in 24 hours, every status counted (NS029, AC-014 (b)); read committed only; per-Professional advisory lock 8111.';
comment on function nestly.outreach_requests_transition() is 'BEFORE UPDATE, SECURITY INVOKER. Only the status moves, once, from pending to accepted or declined, by someone other than the Professional (the policy names the post''s author); responded_at is the database clock. The SET NULL of post_id passes.';
comment on function nestly.professional_articles_update_guard() is 'BEFORE UPDATE, SECURITY INVOKER. The id, the author and created_at do not change; updated_at is the database clock of a content or status change.';

comment on policy professional_profiles_select_viewer on nestly.professional_profiles is 'The owner reads its own; every active account reads an active Professional''s profile with no user block between them (FR-SERV-001/003).';
comment on policy professional_profiles_insert_own on nestly.professional_profiles is 'An active Professional account creates its own profile (FR-PROREG-001), in its registration transaction.';
comment on policy professional_profiles_update_own on nestly.professional_profiles is 'The owner edits its own profile (column grant).';
comment on policy professional_follows_select_party on nestly.professional_follows is 'The follower reads its own Follows; the Professional reads the rows naming it while the follower is active (a count: follower_id is not granted).';
comment on policy professional_follows_insert_follower on nestly.professional_follows is 'An active Regular or Professional follows an active Professional it can read (VAL-018, AC-035); never itself (CHECK).';
comment on policy professional_follows_delete_follower on nestly.professional_follows is 'Unfollow: the follower removes its own row.';
comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself, or an anonymous post with no author id. A Regular to everyone or Friends; a Professional only named, to everyone or its followers, with no stage tag and no help marking (VAL-049, AC-130). Admin and Moderator never.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body, tag and help marking of an active post, or deletes it into the held state. The VAL-049 terms of posts_insert_author hold on an edit.';
comment on policy outreach_requests_select_professional on nestly.outreach_requests is 'The Professional reads its own requests and their status.';
comment on policy outreach_requests_select_target on nestly.outreach_requests is 'The post''s author (named or anonymous) reads the requests on its posts while the Professional is active and no user block stands between them.';
comment on policy outreach_requests_insert_professional on nestly.outreach_requests is 'An active Professional offers help on an active, readable post that asks for help (VAL-010); one per post (key) and 10 a day (NS029).';
comment on policy outreach_requests_update_target on nestly.outreach_requests is 'The post''s author accepts or declines a pending request; an accept needs an active Professional and no Chat Block (FR-SERV-006).';
comment on policy conversations_insert_party on nestly.conversations is
  'A party opens a conversation: Friends (FR-CHAT-002), a pair''s accepted chat request (I8), a Regular with an active Professional (FR-SERV-004, AC-010), or the author of an accepted Offer Help with its Professional (FR-SERV-006, AC-013). Never across a user block.';
comment on policy professional_reviews_select_viewer on nestly.professional_reviews is 'Every active account reads the reviews of an active reviewer with no user block between them; the reviewer reads its own.';
comment on policy professional_reviews_insert_reviewer on nestly.professional_reviews is 'A Regular reviews a Professional once per professional or outreach conversation of theirs in which the Professional wrote (FR-SERV-011, OP-045).';
comment on policy professional_articles_select_viewer on nestly.professional_articles is 'The owner reads all its articles; every active account reads a published article of an active author with no user block between them.';
comment on policy professional_articles_insert_own on nestly.professional_articles is 'An active Professional writes its own article (FR-PRO-003).';
comment on policy professional_articles_update_own on nestly.professional_articles is 'Only the owner edits or hides its article (AC-094).';
comment on policy professional_articles_delete_own on nestly.professional_articles is 'Only the owner deletes its article (AC-094).';
comment on policy posts_select_viewer on nestly.posts is
  'As F3.0a and F3.0b, plus (I11, AC-130): a followers-only post is read by the followers of its Professional author. A post the viewer hid or reported is not returned to them; the author reads a post they deleted-with-hold only in the holding transaction.';
