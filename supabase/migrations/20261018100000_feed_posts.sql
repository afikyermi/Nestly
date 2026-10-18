-- =====================================================================================================================
-- Posts, the anonymous author's separation, per-viewer hides, and the versioned feed configuration — I3 F3.0a (feed-groundwork).
--
-- Source: .work/feed-groundwork/schema.md (F3.0a; Gate 2, ORCHESTRATOR 18.10.2026, A&D amendments 1-2, Afik 18.10: Restricted limits
--         only the profile page); spec.md criteria 1-9, 13 (post), 16 (hides), 17-18.
-- SRS: FR-FEED-001/002/005/006 · BR-059/062/064-066/073 · VAL-036/038 · OP-033 · §13 Post, AlgorithmConfiguration · platform rules 1, 2, 12,
--      15, 19, 20 · S-26 (final shape).
--
-- posts                    one row per post or share (text, audience, anonymous flag, optional stage tag, share reference, status).
--                          posts.author_id is NULL exactly when the post is anonymous.
-- post_authors             the real author of an anonymous post, apart from posts (rule 20). The author reads their own rows; no one else.
-- post_hides               a viewer's own "hide this post"; never a ranking input (7א).
-- algorithm_configurations one row per version of the feed settings (BR-059); v1 is seeded here; append-only.
-- Author status: posts and post_authors copy users.status under composite FKs (ON UPDATE CASCADE; the F2.4a pattern), so a policy can ask
--                "is the author active" without reading users. Posting is Regular-only (FKs to regular_profiles).
-- No policy of any table reads posts: the "is that original readable" check of a share runs in a BEFORE INSERT invoker trigger, as a
-- separate query under the same RLS (an RLS expansion that meets a relation already being expanded raises "infinite recursion").
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. All three functions are SECURITY INVOKER.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261018100000_feed_posts.down.sql (refuses once a post, separation row or hide exists, or the config holds more than the seed).
-- =====================================================================================================================

-- 1. posts (the two FKs to post_authors and from post_authors are added after both tables exist).
create table nestly.posts (
  id                uuid        not null default gen_random_uuid()
    constraint posts_pkey primary key,
  author_id         uuid        default auth.uid(),
  author_status     text        not null default 'active',
  is_anonymous      boolean     not null default false,
  anonymous_post_id uuid
    constraint posts_anonymous_post_id_key unique,
  audience          text        not null
    constraint posts_audience_value_check check (audience in ('everyone', 'friends')),
  body              text,
  stage_tag         text
    constraint posts_stage_tag_check check (stage_tag in ('planning', 'pregnant', 'has_child')),
  is_share          boolean     not null default false,
  shared_post_id    uuid,
  status            text        not null default 'active'
    constraint posts_status_check check (status in ('active', 'hidden', 'removed', 'deleted')),
  created_at        timestamptz not null default now(),
  constraint posts_author_id_check check ((author_id is null) = is_anonymous),
  constraint posts_anonymous_post_id_check
    check (anonymous_post_id is not distinct from case when is_anonymous then id end),
  constraint posts_audience_check check (not (is_anonymous and audience = 'friends')),
  constraint posts_body_check check (body is null or btrim(body) <> ''),
  constraint posts_body_required_check check (is_share or body is not null),
  constraint posts_shared_post_id_check check (shared_post_id is distinct from id),
  constraint posts_shared_post_flag_check check (shared_post_id is null or is_share),
  constraint posts_share_anonymous_check check (not (is_share and is_anonymous)),
  constraint posts_author_id_fkey foreign key (author_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint posts_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade,
  constraint posts_shared_post_id_fkey foreign key (shared_post_id)
    references nestly.posts (id) on delete set null
);

-- 2. post_authors: the anonymous post's real author (rule 20). Never granted a column the client could send but post_id.
create table nestly.post_authors (
  post_id       uuid not null
    constraint post_authors_pkey primary key,
  author_id     uuid not null default auth.uid(),
  author_status text not null default 'active',
  constraint post_authors_post_id_author_status_key unique (post_id, author_status),
  constraint post_authors_post_id_fkey foreign key (post_id)
    references nestly.posts (anonymous_post_id) on delete cascade,
  constraint post_authors_author_id_fkey foreign key (author_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint post_authors_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

-- Circular and deferred: an anonymous post cannot commit without its separation row; a status change rewrites both copies.
alter table nestly.posts
  add constraint posts_anonymous_author_fkey foreign key (anonymous_post_id, author_status)
    references nestly.post_authors (post_id, author_status) on update cascade on delete cascade
    deferrable initially deferred;

-- 3. post_hides (7א): a viewer's own hide.
create table nestly.post_hides (
  user_id    uuid        not null default auth.uid(),
  post_id    uuid        not null,
  created_at timestamptz not null default now(),
  constraint post_hides_pkey primary key (user_id, post_id),
  constraint post_hides_user_id_fkey foreign key (user_id) references nestly.users (id) on delete cascade,
  constraint post_hides_post_id_fkey foreign key (post_id) references nestly.posts (id) on delete cascade
);

-- 4. Indexes (schema.md "Indexes": each with its query).
create index posts_feed_idx on nestly.posts (created_at desc, id desc);
create index posts_author_id_created_at_idx on nestly.posts (author_id, created_at desc) where author_id is not null;
create index posts_shared_post_id_idx on nestly.posts (shared_post_id) where shared_post_id is not null;
create index post_authors_author_id_idx on nestly.post_authors (author_id);
create index post_hides_post_id_idx on nestly.post_hides (post_id);

-- 5. Triggers. SECURITY INVOKER; auth.uid() is the caller.
create function nestly.posts_insert_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  orig record;
begin
  new.is_share := new.shared_post_id is not null;
  if new.is_anonymous then
    new.author_id := null;
    new.anonymous_post_id := new.id;
  else
    new.anonymous_post_id := null;
  end if;
  if new.shared_post_id is not null then
    -- the original, read under the caller's own RLS: unreadable to the sharer looks the same as absent (BR-064/065, VAL-038)
    select p.audience, p.is_anonymous, p.is_share, p.status into orig
      from nestly.posts p where p.id = new.shared_post_id;
    if not found or orig.audience <> 'everyone' or orig.is_anonymous or orig.is_share or orig.status <> 'active' then
      raise exception 'posts: the original cannot be shared' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create function nestly.posts_insert_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_anonymous then
    insert into nestly.post_authors (post_id) values (new.anonymous_post_id);
  end if;
  return null;
end
$$;

create function nestly.algorithm_configurations_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- append-only: the only change a row ever takes is is_active true -> false (retiring a version)
  if tg_op = 'UPDATE' and old.is_active and not new.is_active
     and (pg_catalog.to_jsonb(new) - 'is_active') = (pg_catalog.to_jsonb(old) - 'is_active') then
    return new;
  end if;
  raise exception 'algorithm_configurations: append-only' using errcode = '42501';
end
$$;

revoke execute on function nestly.posts_insert_prepare() from public;
revoke execute on function nestly.posts_insert_author() from public;
revoke execute on function nestly.algorithm_configurations_guard() from public;

create trigger posts_insert_prepare
  before insert on nestly.posts
  for each row execute function nestly.posts_insert_prepare();

create trigger posts_insert_author
  after insert on nestly.posts
  for each row execute function nestly.posts_insert_author();

-- 6. RLS, grants and policies. Every policy: TO authenticated, gated by the caller's own active account (rule 15).
alter table nestly.posts enable row level security, force row level security;
alter table nestly.post_authors enable row level security, force row level security;
alter table nestly.post_hides enable row level security, force row level security;

create policy posts_select_viewer on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and (audience = 'everyone'
      or author_id = (select auth.uid())
      or exists (
        select 1 from nestly.friendships f
        where f.status = 'accepted' and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = posts.author_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = posts.author_id))))
    and not exists (
      select 1 from nestly.post_hides h where h.user_id = (select auth.uid()) and h.post_id = posts.id));

create policy posts_insert_author on nestly.posts
  for insert to authenticated
  with check ((select nestly.is_active_account())
    and status = 'active' and author_status = 'active'
    and ((not is_anonymous and author_id = (select auth.uid())) or (is_anonymous and author_id is null)));

create policy posts_update_author on nestly.posts
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))
  with check ((select nestly.is_active_account()) and status = 'active' and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy posts_delete_author on nestly.posts
  for delete to authenticated
  using ((select nestly.is_active_account()) and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

create policy post_authors_select_author on nestly.post_authors
  for select to authenticated
  using ((select nestly.is_active_account()) and author_id = (select auth.uid()));

create policy post_authors_insert_author on nestly.post_authors
  for insert to authenticated
  with check ((select nestly.is_active_account()) and author_id = (select auth.uid()) and author_status = 'active');

create policy post_hides_select_owner on nestly.post_hides
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy post_hides_insert_owner on nestly.post_hides
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy post_hides_delete_owner on nestly.post_hides
  for delete to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

revoke all on table nestly.posts, nestly.post_authors, nestly.post_hides from public, anon;

grant select, delete on table nestly.posts to authenticated;
grant insert (is_anonymous, audience, body, stage_tag, shared_post_id),
      update (audience, body, stage_tag) on table nestly.posts to authenticated;
grant select on table nestly.post_authors to authenticated;
grant insert (post_id) on table nestly.post_authors to authenticated;
grant select, delete on table nestly.post_hides to authenticated;
grant insert (post_id) on table nestly.post_hides to authenticated;

-- 7. algorithm_configurations (BR-059): one row per version; the migration writes it, no role does.
create table nestly.algorithm_configurations (
  id                         uuid        not null default gen_random_uuid()
    constraint algorithm_configurations_pkey primary key,
  surface                    text        not null
    constraint algorithm_configurations_surface_check check (surface in ('regular_feed')),
  version                    integer     not null
    constraint algorithm_configurations_version_check check (version > 0),
  is_active                  boolean     not null,
  w_fresh                    numeric     not null
    constraint algorithm_configurations_w_fresh_check check (w_fresh between 0 and 5),
  w_friend                   numeric     not null
    constraint algorithm_configurations_w_friend_check check (w_friend between 0 and 5),
  w_quality                  numeric     not null
    constraint algorithm_configurations_w_quality_check check (w_quality between 0 and 2),
  w_stage                    numeric     not null
    constraint algorithm_configurations_w_stage_check check (w_stage between 0 and 2),
  half_life_hours            integer     not null
    constraint algorithm_configurations_half_life_hours_check check (half_life_hours between 1 and 336),
  quality_cap                integer     not null
    constraint algorithm_configurations_quality_cap_check check (quality_cap between 1 and 1000),
  scored_window_days         integer     not null
    constraint algorithm_configurations_scored_window_days_check check (scored_window_days between 1 and 90),
  diversity_window           integer     not null
    constraint algorithm_configurations_diversity_window_check check (diversity_window between 3 and 20),
  max_same_creator_in_window integer     not null
    constraint algorithm_configurations_max_same_creator_check check (max_same_creator_in_window between 1 and diversity_window),
  max_anonymous_in_window    integer     not null
    constraint algorithm_configurations_max_anonymous_check check (max_anonymous_in_window between 1 and diversity_window),
  page_size                  integer     not null
    constraint algorithm_configurations_page_size_check check (page_size between 5 and 50),
  created_at                 timestamptz not null default now(),
  created_by                 text        not null
    constraint algorithm_configurations_created_by_check check (btrim(created_by) <> ''),
  reason                     text        not null
    constraint algorithm_configurations_reason_check check (btrim(reason) <> ''),
  constraint algorithm_configurations_surface_version_key unique (surface, version)
);

create unique index algorithm_configurations_surface_active_key
  on nestly.algorithm_configurations (surface) where is_active;

create trigger algorithm_configurations_guard
  before update or delete on nestly.algorithm_configurations
  for each row execute function nestly.algorithm_configurations_guard();

-- Seed v1 (I3-algorithm.md defaults), before RLS is enabled: the owner has no insert policy.
insert into nestly.algorithm_configurations
  (surface, version, is_active, w_fresh, w_friend, w_quality, w_stage, half_life_hours, quality_cap, scored_window_days,
   diversity_window, max_same_creator_in_window, max_anonymous_in_window, page_size, created_by, reason)
values
  ('regular_feed', 1, true, 1.0, 0.5, 0.2, 0, 24, 20, 14, 5, 2, 2, 20,
   'ALGORITHM & DATA, migration 20261018100000', 'I3 defaults, I3-algorithm.md');

alter table nestly.algorithm_configurations enable row level security, force row level security;

create policy algorithm_configurations_select_all on nestly.algorithm_configurations
  for select to authenticated
  using ((select nestly.is_active_account()));

revoke all on table nestly.algorithm_configurations from public, anon;
grant select on table nestly.algorithm_configurations to authenticated;

-- 8. Comments.
comment on table nestly.posts is
  'SRS Post (§13, FR-FEED-001/002/005/006): a post or a share. Visible per posts_select_viewer; author_id is NULL exactly when the post is anonymous (the real author is in post_authors, rule 20). Posting is Regular-only.';
comment on column nestly.posts.id is 'The post.';
comment on column nestly.posts.author_id is
  'The named author (database default auth.uid(), a Regular profile); NULL on an anonymous post (set by posts_insert_prepare). Never granted to a client.';
comment on column nestly.posts.author_status is
  'Copy of the author''s users.status (composite FKs, ON UPDATE CASCADE): eligibility only (BR-065, BR-073, rule 15).';
comment on column nestly.posts.is_anonymous is
  'FR-FEED-005. Set at insert only; immutable (no UPDATE grant). An anonymous post is never friends-only (posts_audience_check) and never a share.';
comment on column nestly.posts.anonymous_post_id is
  'Equal to id exactly when the post is anonymous (set by posts_insert_prepare); the key post_authors references.';
comment on column nestly.posts.audience is 'OP-033: everyone or friends (friends only).';
comment on column nestly.posts.body is
  'The text, or the sharer''s text on a share; NULL only on a share. Length limit: F3.1 (no writer before).';
comment on column nestly.posts.stage_tag is
  'Afik 5א: the author-chosen journey tag (planning, pregnant, has_child), NULL when none. Nothing derives it from journey_contexts.';
comment on column nestly.posts.is_share is
  'Set by posts_insert_prepare from shared_post_id; stays true after the original is deleted (shared_post_id becomes NULL).';
comment on column nestly.posts.shared_post_id is
  'The original of a share (VAL-038); ON DELETE SET NULL, so a share survives its original. Only an active, public, non-anonymous, non-share original the sharer can read.';
comment on column nestly.posts.status is
  'active, hidden, removed or deleted. Only active is visible; no client can change it (no UPDATE grant): moderation (I4) and held deletion (F3.0b) do.';
comment on column nestly.posts.created_at is 'When the post was created: freshness, the snapshot bound and the keyset.';
comment on table nestly.post_authors is
  'Rule 20, S-26: the real author of an anonymous post, apart from posts. Readable by the author only; no view, no other policy, no definer path. I4''s audited reveal is the only other path, designed then.';
comment on column nestly.post_authors.post_id is 'The anonymous post (references posts.anonymous_post_id, so never a named post).';
comment on column nestly.post_authors.author_id is 'The real author (default auth.uid(); a Regular profile). Never granted to a client.';
comment on column nestly.post_authors.author_status is 'Copy of users.status (composite FK, ON UPDATE CASCADE); the target of posts'' deferred FK.';
comment on table nestly.post_hides is
  'Afik 7א: a viewer''s own hide of a post. Read and written by its owner only; no policy, function or view depends on it except posts_select_viewer; never a ranking input.';
comment on column nestly.post_hides.user_id is 'The viewer (default auth.uid()).';
comment on column nestly.post_hides.post_id is 'The hidden post; the row goes with the post.';
comment on column nestly.post_hides.created_at is 'When the viewer hid it.';
comment on table nestly.algorithm_configurations is
  'BR-059, §13 AlgorithmConfiguration: one row per version of a surface''s feed settings (I3-algorithm.md Configuration). Written by migrations only; algorithm_configurations_guard allows nothing but retiring a version.';
comment on column nestly.algorithm_configurations.surface is 'The feed surface the settings belong to (regular_feed).';
comment on column nestly.algorithm_configurations.version is 'Integer > 0; 0 is the built-in fallback and never stored.';
comment on column nestly.algorithm_configurations.is_active is 'At most one active row per surface; the only column that may change, and only true to false.';
comment on column nestly.algorithm_configurations.w_fresh is 'Weight of freshness (0-5).';
comment on column nestly.algorithm_configurations.w_friend is 'Weight of the friend term (0-5).';
comment on column nestly.algorithm_configurations.w_quality is 'Weight of the quality term (0-2).';
comment on column nestly.algorithm_configurations.w_stage is 'Weight of the stage match (0-2); 0 in v1.';
comment on column nestly.algorithm_configurations.half_life_hours is 'Freshness half-life in hours (1-336).';
comment on column nestly.algorithm_configurations.quality_cap is 'Cap of the quality count (1-1000).';
comment on column nestly.algorithm_configurations.scored_window_days is 'Age in days up to which a post is scored (1-90).';
comment on column nestly.algorithm_configurations.diversity_window is 'Number of consecutive units a diversity cap applies to (3-20).';
comment on column nestly.algorithm_configurations.max_same_creator_in_window is 'At most this many units by one creator per window (1 to the window).';
comment on column nestly.algorithm_configurations.max_anonymous_in_window is 'At most this many anonymous units per window (1 to the window).';
comment on column nestly.algorithm_configurations.page_size is 'Units per page (5-50).';
comment on column nestly.algorithm_configurations.created_at is 'When the version was written.';
comment on column nestly.algorithm_configurations.created_by is 'Who approved it (a reviewer and the migration, not a user: no Admin exists yet).';
comment on column nestly.algorithm_configurations.reason is 'Why the version exists.';
comment on index nestly.posts_feed_idx is
  'The feed''s ordered scan (created_at, id), not partial: policies, not the index, decide eligibility, and no qual implies status = active once held posts exist.';
comment on index nestly.posts_author_id_created_at_idx is 'An author''s own posts, newest first; both author FK cascades.';
comment on index nestly.posts_shared_post_id_idx is 'ON DELETE SET NULL of the original, and share dedup.';
comment on index nestly.post_authors_author_id_idx is 'The author''s own separation rows; the author FK cascades.';
comment on index nestly.post_hides_post_id_idx is 'The cascade when a post is deleted.';
comment on index nestly.algorithm_configurations_surface_active_key is 'At most one active version per surface.';
comment on function nestly.posts_insert_prepare() is
  'SECURITY INVOKER. Before insert: sets is_share, anonymous_post_id and a NULL author_id on an anonymous post; for a share, reads the original under the caller''s RLS and refuses (42501) one that is friends-only, anonymous, a share, not active or unreadable (BR-064/065, VAL-038).';
comment on function nestly.posts_insert_author() is
  'SECURITY INVOKER. After insert of an anonymous post: writes its post_authors row for the caller (rule 20).';
comment on function nestly.algorithm_configurations_guard() is
  'SECURITY INVOKER. Refuses every UPDATE and DELETE except retiring a version (is_active true to false): the table is append-only.';
comment on policy posts_select_viewer on nestly.posts is
  'An active account reads an active post of an active author: everyone-posts, its own, a friend''s friends-only post (accepted Friendship); never one it hid. Anonymous posts (author_id NULL) are reachable only through everyone (BR-062, rule 15).';
comment on policy posts_insert_author on nestly.posts is
  'An active account inserts an active post naming itself as author, or an anonymous post with no author id; the FKs prove a Regular author.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post (column grant); the status cannot be changed.';
comment on policy posts_delete_author on nestly.posts is 'The author (named, or through post_authors) deletes the post (F3.0a: immediate; held deletion is F3.0b).';
comment on policy post_authors_select_author on nestly.post_authors is 'The real author reads their own separation rows; no other user (rule 20).';
comment on policy post_authors_insert_author on nestly.post_authors is
  'Written by posts_insert_author for the caller; the FK proves the post anonymous and the PK allows one row.';
comment on policy post_hides_select_owner on nestly.post_hides is 'A viewer reads their own hides.';
comment on policy post_hides_insert_owner on nestly.post_hides is 'A viewer hides a post for themselves; the FK proves the post exists.';
comment on policy post_hides_delete_owner on nestly.post_hides is 'A viewer undoes their own hide.';
comment on policy algorithm_configurations_select_all on nestly.algorithm_configurations is
  'Every version, active and retired, is readable by an active account (versioned constants, no personal data): pagination pinning and last-known-good need them. No write policy for any role.';
