-- =====================================================================================================================
-- Down script for supabase/migrations/20261025300000_drop_own_post_engagement.sql: recreates own_post_engagement(integer) and its three
-- policies exactly as 20261025100000_own_post_engagement.sql created them. Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only.
-- Safe:     always: the migration wrote no data.
-- Restores: the function, its grants and comments, and trend_scopes_insert_engagement, reactions_select_within_engagement and
--           comments_select_within_engagement; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the drop own post engagement down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

-- 1. The scope row: only an app_owner definer writes it, for this transaction, for an active caller.
create policy trend_scopes_insert_engagement on nestly.trend_scopes
  for insert to app_owner
  with check (xact = pg_catalog.pg_current_xact_id() and (select nestly.is_active_account()));

-- 2. The two scoped reads. The EXISTS over trend_scopes names no column of the row, so it runs once per statement.
create policy reactions_select_within_engagement on nestly.reactions
  for select to app_owner
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.trend_scopes s
                 where s.xact = pg_catalog.pg_current_xact_id_if_assigned()
                   and s.nonce::text = pg_catalog.current_setting('nestly.engagement_scope', true))
    and post_id is not null and liker_status = 'active' and not is_by_author);

create policy comments_select_within_engagement on nestly.comments
  for select to app_owner
  using ((select nestly.is_active_account())
    and exists (select 1 from nestly.trend_scopes s
                 where s.xact = pg_catalog.pg_current_xact_id_if_assigned()
                   and s.nonce::text = pg_catalog.current_setting('nestly.engagement_scope', true))
    and status = 'active' and parent_status = 'active' and (author_id is null or author_status = 'active') and not is_by_post_author);

-- 3. The function.
create function nestly.own_post_engagement(p_days integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_nonce uuid := pg_catalog.gen_random_uuid();
  v_since timestamptz;
  n bigint;
begin
  if v_me is null or not nestly.is_active_account() then
    return 0;
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'own_post_engagement: the period is 1 to 365 days' using errcode = '22023';
  end if;
  v_since := pg_catalog.now() - pg_catalog.make_interval(days => p_days);
  insert into nestly.trend_scopes (nonce) values (v_nonce);
  perform pg_catalog.set_config('nestly.engagement_scope', v_nonce::text, true);
  select (select count(*)
            from nestly.posts p
            join nestly.reactions x on x.post_id = p.id
           where p.author_id = v_me and p.status = 'active' and p.author_status = 'active'
             and x.liker_status = 'active' and not x.is_by_author
             and x.created_at > v_since)
       + (select count(*)
            from nestly.posts p
            join nestly.comments m on m.post_id = p.id
           where p.author_id = v_me and p.status = 'active' and p.author_status = 'active'
             and m.status = 'active' and m.parent_status = 'active' and (m.author_id is null or m.author_status = 'active')
             and not m.is_by_post_author
             and m.created_at > v_since)
    into n;
  perform pg_catalog.set_config('nestly.engagement_scope', '', true);
  delete from nestly.trend_scopes where nonce = v_nonce;
  return n::integer;
end
$$;

revoke execute on function nestly.own_post_engagement(integer) from public;
grant  execute on function nestly.own_post_engagement(integer) to authenticated;

-- 4. Comments.
comment on function nestly.own_post_engagement(integer) is
  'FR-PRO-001, AC-018, VAL-032: the number of likes and comments by others in the last p_days days (1 to 365, else 22023) on the caller''s own posts, exactly what the caller''s own policies count: its active named posts (an anonymous post counts none, as today), likes of active likers but its own, active comments of active commenters under an active parent but its own; the restrictive block, group and identical-reports hides apply as they do to the caller. NULL or inactive caller: 0. No argument names a user or a post; nothing but the number leaves it. SECURITY DEFINER (decisions-in-force.md §19, Afik 25.10.2026: a number only, pgTAP file 109 and a separate review), owner app_owner, pinned search_path; reads only through reactions_select_within_engagement and comments_select_within_engagement, opened while it holds its nonce in trend_scopes (nestly.engagement_scope).';
comment on policy trend_scopes_insert_engagement on nestly.trend_scopes is 'decisions-in-force.md §19: own_post_engagement() writes its nonce for this transaction, for an active caller.';
comment on policy reactions_select_within_engagement on nestly.reactions is 'decisions-in-force.md §19: own_post_engagement() (its nonce scope) reads likes of a post by an active liker who is not the author; the statement keeps only the caller''s own active posts.';
comment on policy comments_select_within_engagement on nestly.comments is 'decisions-in-force.md §19: own_post_engagement() (its nonce scope) reads active comments of active commenters under an active parent, not by the post''s author; the statement keeps only the caller''s own active posts.';

delete from supabase_migrations.schema_migrations where version = '20261025300000';

commit;
