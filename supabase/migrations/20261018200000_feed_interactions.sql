-- =====================================================================================================================
-- Comments, likes, reports, held deletion and its purge — I3 F3.0b (feed-groundwork).
--
-- Source: .work/feed-groundwork/schema-b.md (Gate 2, ORCHESTRATOR 18.10.2026, A&D 1-3, Afik 18.10: a reported comment or user stays
--         visible to everyone, only a reported POST is hidden from its reporter); spec.md criteria 10-12, 13 (comment), 14, 15, 16 (reporter).
-- SRS: FR-FEED-003/005 · FR-MOD-001 · BR-062/065/073/074 · AC-076 · §13 Comment, Reaction, Report · platform rules 1, 2, 6, 12, 15, 19, 20.
--
-- comments         one level of replies; the real author of an anonymous post comments with author_id NULL and is_by_post_author (AC-076).
-- reactions        one Like, identity-free: readable while its target is readable and its liker active (a count needs no identity).
-- reaction_owners  who liked: the owner reads it; one like per (user, target).
-- reports          a user's report of a post, a comment or a user (FR-MOD-001); readable by the reporter only; no UPDATE/DELETE grant (I4).
-- posts            gains the held state (held_at, held_until, held_xact) and replaces posts_select_viewer / posts_update_author.
-- delete_post / delete_comment   the author's delete: a row with an open report cannot be deleted (reports_open_target_check), so it is held
--                  (status deleted, invisible to everyone after the holding transaction) and purged by purge_held_content() (app_jobs).
-- No SECURITY DEFINER: tests.approved_security_definer() is unchanged. Every function is SECURITY INVOKER, search_path ''.
-- Approved exception (rule 6, data-model): policies TO app_jobs on posts, comments and reports — see the policies' comments.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261018200000_feed_interactions.down.sql (refuses once a comment, like, report or a held post exists).
-- =====================================================================================================================

-- 1. posts: the held state (c14). held_xact is the holding transaction: only that one reads the row back (see posts_select_viewer).
alter table nestly.posts
  add column held_at    timestamptz,
  add column held_until timestamptz,
  add column held_xact  xid8;

alter table nestly.posts
  add constraint posts_held_check check (
    (status = 'deleted') = (held_at is not null)
    and (held_at is null) = (held_until is null)
    and (held_at is null) = (held_xact is null)
    and (held_until is null or held_until <= held_at + interval '2160 hours'));

-- A post's text, and a share's, is capped at 2000 characters (NULL passes). Comments: F3.3 sets the cap.
alter table nestly.posts
  add constraint posts_body_length_check check (char_length(body) <= 2000);

-- 2. comments (FR-FEED-003). UNIQUE (id, post_id) is the target of the reply FK, which keeps a reply on its parent's post (c10).
create table nestly.comments (
  id                 uuid        not null default gen_random_uuid()
    constraint comments_pkey primary key,
  post_id            uuid        not null,
  parent_id          uuid,
  parent_status      text        not null default 'active',
  author_id          uuid        default auth.uid(),
  author_status      text        not null default 'active',
  is_by_post_author  boolean     not null default false,
  body               text        not null
    constraint comments_body_check check (body ~ '[^[:space:]]'),
  status             text        not null default 'active'
    constraint comments_status_check check (status in ('active', 'hidden', 'removed', 'deleted')),
  held_at            timestamptz,
  held_until         timestamptz,
  held_xact          xid8,
  created_at         timestamptz not null default now(),
  constraint comments_id_post_id_status_key unique (id, post_id, status),
  constraint comments_parent_status_check check (parent_id is not null or parent_status = 'active'),
  constraint comments_author_id_check check (author_id is not null or is_by_post_author),
  constraint comments_held_check check (
    (status = 'deleted') = (held_at is not null)
    and (held_at is null) = (held_until is null)
    and (held_at is null) = (held_xact is null)
    and (held_until is null or held_until <= held_at + interval '2160 hours')),
  constraint comments_post_id_fkey foreign key (post_id)
    references nestly.posts (id) on delete cascade,
  constraint comments_parent_id_fkey foreign key (parent_id, post_id, parent_status)
    references nestly.comments (id, post_id, status) on update cascade on delete cascade,
  constraint comments_author_id_fkey foreign key (author_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint comments_author_status_fkey foreign key (author_id, author_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

-- 3. reactions + reaction_owners (c12): a like is two rows. reactions carries no identity; reaction_owners says who.
create table nestly.reactions (
  id            uuid        not null default gen_random_uuid()
    constraint reactions_pkey primary key,
  post_id       uuid,
  comment_id    uuid,
  target_id     uuid        generated always as (coalesce(post_id, comment_id)) stored,
  liker_status  text        not null default 'active',
  is_by_author  boolean     not null default false,
  created_at    timestamptz not null default now(),
  constraint reactions_target_check check (num_nonnulls(post_id, comment_id) = 1),
  constraint reactions_id_target_id_key unique (id, target_id),
  constraint reactions_post_id_fkey foreign key (post_id)
    references nestly.posts (id) on delete cascade,
  constraint reactions_comment_id_fkey foreign key (comment_id)
    references nestly.comments (id) on delete cascade
);

create table nestly.reaction_owners (
  reaction_id   uuid not null
    constraint reaction_owners_pkey primary key,
  user_id       uuid not null default auth.uid(),
  target_id     uuid not null,
  liker_status  text not null default 'active',
  constraint reaction_owners_user_id_target_id_key unique (user_id, target_id),
  constraint reaction_owners_reaction_id_liker_status_key unique (reaction_id, liker_status),
  constraint reaction_owners_reaction_fkey foreign key (reaction_id, target_id)
    references nestly.reactions (id, target_id) on delete cascade,
  constraint reaction_owners_user_id_fkey foreign key (user_id)
    references nestly.regular_profiles (user_id) on delete cascade,
  constraint reaction_owners_liker_status_fkey foreign key (user_id, liker_status)
    references nestly.users (id, status) on update cascade on delete cascade
);

-- Circular and deferred: a like cannot commit without its owner row; a status change rewrites both copies.
alter table nestly.reactions
  add constraint reactions_owner_fkey foreign key (id, liker_status)
    references nestly.reaction_owners (reaction_id, liker_status) on update cascade on delete cascade
    deferrable initially deferred;

-- 4. reports (FR-MOD-001). The reporter's FK is RESTRICT: I9 decides what stays of a reporter. The target FKs are SET NULL, which an
--    open report refuses (reports_open_target_check): that is how delete_post / delete_comment know to hold instead of delete.
create table nestly.reports (
  id                uuid        not null default gen_random_uuid()
    constraint reports_pkey primary key,
  reporter_id       uuid        not null default auth.uid(),
  target_kind       text        not null
    constraint reports_target_kind_check check (target_kind in ('post', 'comment', 'user')),
  post_id           uuid,
  comment_id        uuid,
  reported_user_id  uuid,
  reason            text        not null
    constraint reports_reason_check check (reason in (
      'child_safety', 'harassment', 'sexual_violent_hateful', 'personal_information',
      'medical_misinformation', 'impersonation', 'spam', 'other')),
  details           text
    constraint reports_details_check check (details is null or details ~ '[^[:space:]]'),
  status            text        not null default 'open'
    constraint reports_status_check check (status in ('open', 'handled', 'expired')),
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  constraint reports_one_target_check check (num_nonnulls(post_id, comment_id, reported_user_id) <= 1),
  constraint reports_self_check check (reported_user_id is null or reported_user_id <> reporter_id),
  constraint reports_other_details_check check (reason <> 'other' or details is not null),
  constraint reports_closed_check check ((closed_at is null) = (status = 'open')),
  constraint reports_open_target_check check (
    status <> 'open'
    or case target_kind
         when 'post' then post_id is not null
         when 'comment' then comment_id is not null
         else reported_user_id is not null
       end),
  constraint reports_reporter_post_key unique (reporter_id, post_id),
  constraint reports_reporter_comment_key unique (reporter_id, comment_id),
  constraint reports_reporter_user_key unique (reporter_id, reported_user_id),
  constraint reports_reporter_id_fkey foreign key (reporter_id)
    references nestly.users (id) on delete restrict,
  constraint reports_post_id_fkey foreign key (post_id)
    references nestly.posts (id) on delete set null,
  constraint reports_comment_id_fkey foreign key (comment_id)
    references nestly.comments (id) on delete set null,
  constraint reports_reported_user_id_fkey foreign key (reported_user_id)
    references nestly.users (id) on delete set null
);

-- 5. Indexes (schema-b.md "Indexes").
create index comments_post_id_created_at_idx on nestly.comments (post_id, created_at, id);
create index comments_parent_id_idx on nestly.comments (parent_id, post_id) where parent_id is not null;
create index comments_author_id_idx on nestly.comments (author_id) where author_id is not null;
create index posts_held_until_idx on nestly.posts (held_until) where status = 'deleted';
create index comments_held_until_idx on nestly.comments (held_until) where status = 'deleted';
create index reactions_post_id_idx on nestly.reactions (post_id) where post_id is not null;
create index reactions_comment_id_idx on nestly.reactions (comment_id) where comment_id is not null;
create index reports_post_id_idx on nestly.reports (post_id) where post_id is not null;
create index reports_comment_id_idx on nestly.reports (comment_id) where comment_id is not null;
create index reports_reported_user_id_idx on nestly.reports (reported_user_id) where reported_user_id is not null;

-- 6. Triggers. SECURITY INVOKER; auth.uid() is the caller; every read inside runs under the caller's RLS.

-- Held deletion (c14). The author's only status change is active -> deleted. Other callers (the owner role: moderation, fixtures) may
-- set any status, and the held columns follow it so that posts_held_check / comments_held_check hold.
create function nestly.content_hold()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if current_user = 'authenticated' and not (old.status = 'active' and new.status = 'deleted') then
    raise exception 'content: an author can only delete their content' using errcode = '42501';
  end if;
  if new.status = 'deleted' then
    new.held_at := now();
    new.held_until := now() + interval '2160 hours';
    new.held_xact := pg_catalog.pg_current_xact_id();
  else
    new.held_at := null;
    new.held_until := null;
    new.held_xact := null;
  end if;
  return new;
end
$$;

create function nestly.comments_insert_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent record;
  post_author uuid;
begin
  if new.parent_id is not null then
    -- the parent, read under the caller's RLS (so it must be readable); only a top-level comment takes replies (c10)
    select c.parent_id into parent from nestly.comments c where c.id = new.parent_id;
    if not found or parent.parent_id is not null then
      raise exception 'comments: the parent cannot take a reply' using errcode = '42501';
    end if;
  end if;
  if exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = (select auth.uid())) then
    -- the real author of an anonymous post: no id on the comment, the database marks it (AC-076)
    new.author_id := null;
    new.is_by_post_author := true;
  else
    select p.author_id into post_author from nestly.posts p where p.id = new.post_id;
    new.is_by_post_author := post_author is not null and post_author is not distinct from new.author_id;
  end if;
  return new;
end
$$;

create function nestly.reactions_insert_prepare()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  -- the liker is the content's author (named, or the real author of an anonymous post / comment): the quality count excludes it
  if new.post_id is not null then
    new.is_by_author := exists (
      select 1 from nestly.posts p
       where p.id = new.post_id
         and (p.author_id = uid
              or exists (select 1 from nestly.post_authors pa where pa.post_id = p.id and pa.author_id = uid)));
  else
    new.is_by_author := exists (
      select 1 from nestly.comments c
       where c.id = new.comment_id
         and (c.author_id = uid
              or (c.author_id is null
                  and exists (select 1 from nestly.post_authors pa where pa.post_id = c.post_id and pa.author_id = uid))));
  end if;
  return new;
end
$$;

create function nestly.reactions_insert_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into nestly.reaction_owners (reaction_id, target_id) values (new.id, new.target_id);
  return null;
end
$$;

create function nestly.reports_insert_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target record;
begin
  if new.post_id is not null then
    -- a readable post that is not the reporter's own; absent and unreadable look the same (no oracle)
    select p.author_id into target from nestly.posts p where p.id = new.post_id;
    if not found
       or target.author_id = uid
       or exists (select 1 from nestly.post_authors pa where pa.post_id = new.post_id and pa.author_id = uid) then
      raise exception 'reports: the post cannot be reported' using errcode = '42501';
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id into target from nestly.comments c where c.id = new.comment_id;
    if not found
       or target.author_id = uid
       or (target.author_id is null
           and exists (select 1 from nestly.post_authors pa where pa.post_id = target.post_id and pa.author_id = uid)) then
      raise exception 'reports: the comment cannot be reported' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- Held deletion. DELETE under the caller's RLS; a row with an open report fails closed (23514, reports_open_target_check, raised by
-- the SET NULL of the report's target in the same statement), and is then held by an UPDATE under RLS. Returns the row count: 1 for a
-- deleted and a held row alike, 0 for a row that is not the caller's.
create function nestly.delete_post(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  begin
    delete from nestly.posts where id = p_id;
    get diagnostics n = row_count;
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.posts set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  return n;
end
$$;

create function nestly.delete_comment(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
  violated text;
begin
  begin
    delete from nestly.comments where id = p_id;
    get diagnostics n = row_count;
    return n;
  exception when check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated is distinct from 'reports_open_target_check' then
      raise;
    end if;
  end;
  update nestly.comments set status = 'deleted' where id = p_id;
  get diagnostics n = row_count;
  return n;
end
$$;

-- The purge, run by the job role (F3.7 schedules it). (1) an open report on held content past its release -> expired (Afik's default,
-- pending his answer); (2) each held row deleted in its own subtransaction: a row whose report is still open and not released fails
-- 23514 and stays. Returns the number of rows deleted.
create function nestly.purge_held_content()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  k integer;
  violated text;
begin
  update nestly.reports rp
     set status = 'expired', closed_at = now()
   where rp.status = 'open'
     and (exists (select 1 from nestly.posts p
                   where p.id = rp.post_id and p.status = 'deleted' and p.held_until <= now())
          or exists (select 1 from nestly.comments c
                      where c.id = rp.comment_id
                        and ((c.status = 'deleted' and c.held_until <= now())
                             or exists (select 1 from nestly.posts p
                                         where p.id = c.post_id and p.status = 'deleted' and p.held_until <= now())
                             or (c.parent_status = 'deleted'
                                 and exists (select 1 from nestly.comments pc
                                              where pc.id = c.parent_id and pc.status = 'deleted' and pc.held_until <= now())))));

  for r in select c.id from nestly.comments c where c.status = 'deleted' order by c.held_at, c.id loop
    begin
      delete from nestly.comments where id = r.id and status = 'deleted';
      get diagnostics k = row_count;
      n := n + k;
    exception when check_violation then
      get stacked diagnostics violated = constraint_name;
      if violated is distinct from 'reports_open_target_check' then
        raise;
      end if;
    end;
  end loop;

  for r in select p.id from nestly.posts p where p.status = 'deleted' order by p.held_at, p.id loop
    begin
      delete from nestly.posts where id = r.id and status = 'deleted';
      get diagnostics k = row_count;
      n := n + k;
    exception when check_violation then
      get stacked diagnostics violated = constraint_name;
      if violated is distinct from 'reports_open_target_check' then
        raise;
      end if;
    end;
  end loop;
  return n;
end
$$;

revoke execute on function nestly.content_hold() from public;
revoke execute on function nestly.comments_insert_prepare() from public;
revoke execute on function nestly.reactions_insert_prepare() from public;
revoke execute on function nestly.reactions_insert_owner() from public;
revoke execute on function nestly.reports_insert_check() from public;
revoke execute on function nestly.delete_post(uuid) from public;
revoke execute on function nestly.delete_comment(uuid) from public;
revoke execute on function nestly.purge_held_content() from public;
grant execute on function nestly.delete_post(uuid) to authenticated;
grant execute on function nestly.delete_comment(uuid) to authenticated;
grant execute on function nestly.purge_held_content() to app_jobs;

create trigger posts_content_hold
  before update of status on nestly.posts
  for each row execute function nestly.content_hold();

create trigger comments_content_hold
  before update of status on nestly.comments
  for each row execute function nestly.content_hold();

create trigger comments_insert_prepare
  before insert on nestly.comments
  for each row execute function nestly.comments_insert_prepare();

create trigger reactions_insert_prepare
  before insert on nestly.reactions
  for each row execute function nestly.reactions_insert_prepare();

create trigger reactions_insert_owner
  after insert on nestly.reactions
  for each row execute function nestly.reactions_insert_owner();

create trigger reports_insert_check
  before insert on nestly.reports
  for each row execute function nestly.reports_insert_check();

-- 7. RLS, grants and policies. Every client policy: TO authenticated, gated by the caller's own active account (rule 15).
alter table nestly.comments enable row level security, force row level security;
alter table nestly.reactions enable row level security, force row level security;
alter table nestly.reaction_owners enable row level security, force row level security;
alter table nestly.reports enable row level security, force row level security;

-- posts: a's two policies replaced. A reporter no longer reads the post they reported (7א); the author reads a post they just held,
-- but only inside the holding transaction (held_xact is NULL in every read-only transaction and differs in every later one), which the
-- UPDATE needs (its new row is checked against the SELECT policy).
drop policy posts_select_viewer on nestly.posts;
create policy posts_select_viewer on nestly.posts
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (status = 'active' and author_status = 'active'
      and (audience = 'everyone'
        or author_id = (select auth.uid())
        or exists (
          select 1 from nestly.friendships f
          where f.status = 'accepted' and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = posts.author_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = posts.author_id))))
      and not exists (
        select 1 from nestly.post_hides h where h.user_id = (select auth.uid()) and h.post_id = posts.id)
      and not exists (
        select 1 from nestly.reports r where r.reporter_id = (select auth.uid()) and r.post_id = posts.id))
    or (status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned() and (
      author_id = (select auth.uid())
      or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))))));

alter policy posts_update_author on nestly.posts
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or exists (select 1 from nestly.post_authors pa where pa.post_id = posts.id and pa.author_id = (select auth.uid()))));

-- comments. The post's own RLS carries eligibility, audience, hides and reporter-hides into every comment.
create policy comments_select_viewer on nestly.comments
  for select to authenticated
  using ((select nestly.is_active_account()) and (
    (status = 'active' and parent_status = 'active' and (author_id is null or author_status = 'active')
      and exists (select 1 from nestly.posts p where p.id = comments.post_id))
    or (status = 'active' and author_id = (select auth.uid()))
    or (status = 'deleted' and held_xact = pg_catalog.pg_current_xact_id_if_assigned() and (
      author_id = (select auth.uid())
      or (author_id is null
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))))));

create policy comments_insert_commenter on nestly.comments
  for insert to authenticated
  with check ((select nestly.is_active_account()) and status = 'active' and author_status = 'active'
    and exists (select 1 from nestly.posts p where p.id = comments.post_id)
    and (author_id = (select auth.uid())
      or (author_id is null and is_by_post_author
          and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create policy comments_update_commenter on nestly.comments
  for update to authenticated
  using ((select nestly.is_active_account()) and status = 'active' and (
    author_id = (select auth.uid())
    or (author_id is null
        and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))))
  with check ((select nestly.is_active_account()) and status in ('active', 'deleted') and (
    author_id = (select auth.uid())
    or (author_id is null
        and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

create policy comments_delete_commenter on nestly.comments
  for delete to authenticated
  using ((select nestly.is_active_account()) and (
    author_id = (select auth.uid())
    or (author_id is null
        and exists (select 1 from nestly.post_authors pa where pa.post_id = comments.post_id and pa.author_id = (select auth.uid())))));

-- reactions: the id-free row is readable while its target is readable and the liker active; the owner row by its owner only.
create policy reactions_select_reader on nestly.reactions
  for select to authenticated
  using ((select nestly.is_active_account()) and liker_status = 'active' and (
    (post_id is not null and exists (select 1 from nestly.posts p where p.id = reactions.post_id))
    or (comment_id is not null and exists (select 1 from nestly.comments c where c.id = reactions.comment_id))));

create policy reactions_insert_reader on nestly.reactions
  for insert to authenticated
  with check ((select nestly.is_active_account()) and liker_status = 'active' and (
    (post_id is not null and exists (select 1 from nestly.posts p where p.id = reactions.post_id))
    or (comment_id is not null and exists (select 1 from nestly.comments c where c.id = reactions.comment_id))));

create policy reactions_delete_owner on nestly.reactions
  for delete to authenticated
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.reaction_owners o where o.reaction_id = reactions.id and o.user_id = (select auth.uid())));

create policy reaction_owners_select_owner on nestly.reaction_owners
  for select to authenticated
  using ((select nestly.is_active_account()) and user_id = (select auth.uid()));

create policy reaction_owners_insert_owner on nestly.reaction_owners
  for insert to authenticated
  with check ((select nestly.is_active_account()) and user_id = (select auth.uid()) and liker_status = 'active');

-- reports: the reporter reads and files their own; nobody updates or deletes (I4).
create policy reports_select_reporter on nestly.reports
  for select to authenticated
  using ((select nestly.is_active_account()) and reporter_id = (select auth.uid()));

create policy reports_insert_reporter on nestly.reports
  for insert to authenticated
  with check ((select nestly.is_active_account()) and reporter_id = (select auth.uid()) and status = 'open');

-- The purge (approved exception, rule 6): the job role has no auth.uid() and reaches every user's held rows and the open reports on them.
create policy posts_select_jobs on nestly.posts
  for select to app_jobs
  using (status = 'deleted');

create policy posts_delete_jobs on nestly.posts
  for delete to app_jobs
  using (status = 'deleted');

create policy comments_select_jobs on nestly.comments
  for select to app_jobs
  using (status = 'deleted' or parent_status = 'deleted' or exists (select 1 from nestly.posts p where p.id = comments.post_id));

create policy comments_delete_jobs on nestly.comments
  for delete to app_jobs
  using (status = 'deleted');

create policy reports_select_jobs on nestly.reports
  for select to app_jobs
  using (status in ('open', 'expired'));

create policy reports_update_jobs on nestly.reports
  for update to app_jobs
  using (status = 'open' and (
    exists (select 1 from nestly.posts p
             where p.id = reports.post_id and p.status = 'deleted' and p.held_until <= now())
    or exists (select 1 from nestly.comments c
                where c.id = reports.comment_id
                  and ((c.status = 'deleted' and c.held_until <= now())
                       or exists (select 1 from nestly.posts p
                                   where p.id = c.post_id and p.status = 'deleted' and p.held_until <= now())
                       or (c.parent_status = 'deleted'
                           and exists (select 1 from nestly.comments pc
                                        where pc.id = c.parent_id and pc.status = 'deleted' and pc.held_until <= now()))))))
  with check (status = 'expired');

revoke all on table nestly.comments, nestly.reactions, nestly.reaction_owners, nestly.reports from public, anon;

-- held_xact and liker_status are never granted (schema-b.md): column-level SELECT on every other column. Policies still read them;
-- a client 'select *' on posts, comments and reactions is 42501 by design.
revoke select on table nestly.posts from authenticated;
grant select (id, author_id, author_status, is_anonymous, anonymous_post_id, audience, body, stage_tag, is_share, shared_post_id, status,
              created_at, held_at, held_until) on table nestly.posts to authenticated;
grant update (status) on table nestly.posts to authenticated;
grant select (id, post_id, parent_id, author_id, author_status, is_by_post_author, body, status, held_at, held_until, created_at),
      delete on table nestly.comments to authenticated;
grant insert (post_id, parent_id, body),
      update (status) on table nestly.comments to authenticated;
grant select (id, post_id, comment_id, target_id, is_by_author, created_at), delete on table nestly.reactions to authenticated;
grant insert (post_id, comment_id) on table nestly.reactions to authenticated;
grant select on table nestly.reaction_owners to authenticated;
grant insert (reaction_id, target_id) on table nestly.reaction_owners to authenticated;
grant select on table nestly.reports to authenticated;
grant insert (target_kind, post_id, comment_id, reported_user_id, reason, details) on table nestly.reports to authenticated;

grant usage on schema nestly to app_jobs;
grant select, delete on table nestly.posts, nestly.comments to app_jobs;
grant select on table nestly.reports to app_jobs;
grant update (status, closed_at) on table nestly.reports to app_jobs;

-- 8. Comments.
comment on column nestly.posts.held_at is 'When the author deleted a post that had an open report (stamped by content_hold); NULL otherwise. Exactly the deleted posts (posts_held_check).';
comment on column nestly.posts.held_until is 'Release time: held_at + 90 days at most (posts_held_check); the purge expires an open report past it.';
comment on column nestly.posts.held_xact is 'The holding transaction: the author reads the row back only inside it (posts_select_viewer). Never granted.';
comment on table nestly.comments is
  'SRS Comment (§13, FR-FEED-003): one level of replies. Visible while the post is readable and the commenter active; the real author of an anonymous post has author_id NULL and is_by_post_author (AC-076).';
comment on column nestly.comments.id is 'The comment.';
comment on column nestly.comments.post_id is 'The post; the comment goes with it.';
comment on column nestly.comments.parent_id is 'The top-level comment this replies to, on the same post (composite FK); NULL on a top-level comment. Replies go with their parent.';
comment on column nestly.comments.parent_status is 'Copy of the parent comment''s status (composite FK, ON UPDATE CASCADE): a reply under a non-active parent is hidden (comments_select_viewer). Never granted.';
comment on column nestly.comments.author_id is 'The commenter (default auth.uid()); NULL only for the real author of an anonymous post (comments_insert_prepare). Never granted to a client.';
comment on column nestly.comments.author_status is 'Copy of the commenter''s users.status (composite FK, ON UPDATE CASCADE): visibility only.';
comment on column nestly.comments.is_by_post_author is 'AC-076 "המחבר": set by comments_insert_prepare, never granted.';
comment on column nestly.comments.body is 'The text; its length cap comes with F3.4''s validation.';
comment on column nestly.comments.status is 'active, hidden, removed or deleted. The author can only delete (content_hold); moderation is I4.';
comment on column nestly.comments.held_at is 'As posts.held_at.';
comment on column nestly.comments.held_until is 'As posts.held_until.';
comment on column nestly.comments.held_xact is 'As posts.held_xact. Never granted.';
comment on column nestly.comments.created_at is 'Thread order.';
comment on table nestly.reactions is
  'One Like (§13 Reaction), identity-free: readable while its target is readable and its liker active, so a count needs no identity. The liker is in reaction_owners.';
comment on column nestly.reactions.id is 'The like; equals reaction_owners.reaction_id.';
comment on column nestly.reactions.post_id is 'The liked post, or NULL; exactly one of post_id and comment_id.';
comment on column nestly.reactions.comment_id is 'The liked comment, or NULL.';
comment on column nestly.reactions.target_id is 'coalesce(post_id, comment_id), stored: the key one like per (user, target) is built on.';
comment on column nestly.reactions.liker_status is 'Copy of the liker''s users.status, no identity (FK pair with reaction_owners): only active likes are readable. Never granted.';
comment on column nestly.reactions.is_by_author is 'The liker is the content''s author (reactions_insert_prepare); the quality count excludes it. Never granted.';
comment on column nestly.reactions.created_at is 'The asOf bound of the quality count.';
comment on table nestly.reaction_owners is 'Who liked: the owner reads their rows; one like per (user, target). Written by reactions_insert_owner.';
comment on column nestly.reaction_owners.reaction_id is 'The like.';
comment on column nestly.reaction_owners.user_id is 'The liker (default auth.uid(); a Regular profile). Never granted to a client.';
comment on column nestly.reaction_owners.target_id is 'The liked post or comment.';
comment on column nestly.reaction_owners.liker_status is 'Copy of users.status (composite FK, ON UPDATE CASCADE).';
comment on table nestly.reports is
  'SRS Report (§13, FR-MOD-001, BR-074): a report of a post, a comment or a user. Read by the reporter only; the 3-report threshold counts people. No UPDATE/DELETE grant for clients (I4 handles).';
comment on column nestly.reports.id is 'The report.';
comment on column nestly.reports.reporter_id is 'The reporter (default auth.uid()); ON DELETE RESTRICT: I9 decides the minimal record. Never granted to a client.';
comment on column nestly.reports.target_kind is 'post, comment or user; survives the target''s SET NULL.';
comment on column nestly.reports.post_id is 'The reported post; SET NULL when deleted. An open report refuses it (reports_open_target_check): the content is held instead.';
comment on column nestly.reports.comment_id is 'The reported comment; as post_id.';
comment on column nestly.reports.reported_user_id is 'The reported user; as post_id. Not the reporter (reports_self_check).';
comment on column nestly.reports.reason is 'One of the 8 reasons of docs/decisions-before-i3-i5-HE.md §3.';
comment on column nestly.reports.details is 'Optional text; required for other. Its cap comes with F3.7''s validation.';
comment on column nestly.reports.status is 'open; handled (I4); expired (the purge, 90 days after the content was held).';
comment on column nestly.reports.closed_at is 'When it was closed; NULL exactly while open.';
comment on column nestly.reports.created_at is 'When it was filed.';
comment on index nestly.comments_post_id_created_at_idx is 'Thread order, comment counts and the post cascade.';
comment on index nestly.comments_parent_id_idx is 'The reply cascade.';
comment on index nestly.comments_author_id_idx is 'The commenter FK cascades.';
comment on index nestly.posts_held_until_idx is 'The purge scan of held posts.';
comment on index nestly.comments_held_until_idx is 'The purge scan of held comments.';
comment on index nestly.reactions_post_id_idx is 'A post''s like count and the cascade.';
comment on index nestly.reactions_comment_id_idx is 'A comment''s like count and the cascade.';
comment on index nestly.reports_post_id_idx is 'The SET NULL lookup when a post is deleted.';
comment on index nestly.reports_comment_id_idx is 'The SET NULL lookup when a comment is deleted.';
comment on index nestly.reports_reported_user_id_idx is 'The SET NULL lookup when a user is deleted.';
comment on function nestly.content_hold() is
  'SECURITY INVOKER. Before update of status on posts and comments: the authenticated author may only go active to deleted (42501 otherwise); a change to deleted stamps held_at, held_until (+90 days) and held_xact; leaving deleted clears them.';
comment on function nestly.comments_insert_prepare() is
  'SECURITY INVOKER. Before insert: a parent must be readable and top-level (42501); the real author of an anonymous post gets author_id NULL and is_by_post_author; the named post author gets the mark; others do not.';
comment on function nestly.reactions_insert_prepare() is 'SECURITY INVOKER. Before insert: sets is_by_author when the liker is the target''s author.';
comment on function nestly.reactions_insert_owner() is 'SECURITY INVOKER. After insert of a like: writes its reaction_owners row for the caller.';
comment on function nestly.reports_insert_check() is
  'SECURITY INVOKER. Before insert: a reported post or comment must be readable to the reporter and not their own (42501), named or through post_authors.';
comment on function nestly.delete_post(uuid) is
  'SECURITY INVOKER. Deletes the caller''s post under RLS; when an open report refuses it (reports_open_target_check) sets status deleted instead (held). Returns 1 for either, 0 for a post that is not the caller''s.';
comment on function nestly.delete_comment(uuid) is 'SECURITY INVOKER. As delete_post, for a comment.';
comment on function nestly.purge_held_content() is
  'SECURITY INVOKER, EXECUTE app_jobs only. Expires open reports on held content past its release, then deletes every held row it can (an open, unreleased report keeps its row). Returns the rows deleted.';
comment on policy posts_select_viewer on nestly.posts is
  'As F3.0a, plus: a post the viewer reported is not returned to them (7א); the author reads a post they deleted-with-hold only in the holding transaction.';
comment on policy posts_update_author on nestly.posts is
  'The author (named, or through post_authors) edits audience, body and tag of an active post, or deletes it into the held state (status active to deleted, content_hold).';
comment on policy posts_select_jobs on nestly.posts is 'Approved exception (rule 6, F3.0b purge): the job role reads held posts.';
comment on policy posts_delete_jobs on nestly.posts is 'Approved exception (rule 6, F3.0b purge): the job role deletes held posts.';
comment on policy comments_select_viewer on nestly.comments is
  'An active comment of an active commenter on a post the viewer can read (the post''s RLS carries audience, hides and reporter-hides); a reply under a non-active parent is hidden; a commenter always reads their own active comment, even once the post is unreadable to them (reported or hid it), so they can delete it; the author reads a held comment only in the holding transaction.';
comment on policy comments_insert_commenter on nestly.comments is 'An active account comments as itself, or as the real author of an anonymous post it wrote (author_id NULL, marked), on a readable post.';
comment on policy comments_update_commenter on nestly.comments is 'The commenter changes the status of an active comment from active to deleted (content_hold); no editing in I3.';
comment on policy comments_delete_commenter on nestly.comments is 'The commenter (or the real author of an anonymous post, for their NULL-id comment) deletes the comment.';
comment on policy comments_select_jobs on nestly.comments is 'Approved exception (rule 6, F3.0b purge): the job role reads held comments, the replies of held comments and the comments of held posts.';
comment on policy comments_delete_jobs on nestly.comments is 'Approved exception (rule 6, F3.0b purge): the job role deletes held comments.';
comment on policy reactions_select_reader on nestly.reactions is 'Whoever can read the target reads its like rows of active likers; an unreadable target gives nothing.';
comment on policy reactions_insert_reader on nestly.reactions is 'An active account likes a readable post or comment.';
comment on policy reactions_delete_owner on nestly.reactions is 'A liker deletes their own like (proved by reaction_owners).';
comment on policy reaction_owners_select_owner on nestly.reaction_owners is 'A liker reads their own owner rows.';
comment on policy reaction_owners_insert_owner on nestly.reaction_owners is 'Written by reactions_insert_owner for the caller.';
comment on policy reports_select_reporter on nestly.reports is 'A reporter reads their own reports (FR-MOD-001); no one else.';
comment on policy reports_insert_reporter on nestly.reports is 'An active account files an open report as itself.';
comment on policy reports_select_jobs on nestly.reports is 'Approved exception (rule 6, F3.0b purge): the job role reads open reports, and the expired ones it just closed (an UPDATE'' new row must pass the SELECT policy).';
comment on policy reports_update_jobs on nestly.reports is
  'Approved exception (rule 6, F3.0b purge): the job role closes an open report as expired once the held content it names passed its release.';
