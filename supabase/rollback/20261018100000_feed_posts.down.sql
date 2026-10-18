-- =====================================================================================================================
-- Down script for supabase/migrations/20261018100000_feed_posts.sql (I3 F3.0a; schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Order:    revert the F3.0a server code first (none exists yet), then run this. F3.0b's down script runs before this one.
-- Safe:     only while posts, post_authors and post_hides hold no row and algorithm_configurations holds nothing but the seed:
--           a post, an anonymous author's separation row and a hide are user data, and after the first real post the way back is
--           a forward migration (data-model rule 7). FORCE RLS would hide every row from app_owner, so it is lifted inside this
--           transaction first and the checks are real.
-- Restores: drops post_hides, post_authors, posts, algorithm_configurations (with their policies, indexes, constraints and
--           triggers), the four functions; deletes the history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the feed_posts down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.posts no force row level security;
alter table nestly.post_authors no force row level security;
alter table nestly.post_hides no force row level security;
alter table nestly.algorithm_configurations no force row level security;

do $$
begin
  if exists (select 1 from nestly.posts) or exists (select 1 from nestly.post_authors) or exists (select 1 from nestly.post_hides) then
    raise exception 'posts, post_authors or post_hides holds a row: rolling back would delete users'' posts. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
  if exists (
    select 1 from nestly.algorithm_configurations
     where not (surface = 'regular_feed' and version = 1 and is_active
       and created_by = 'ALGORITHM & DATA, migration 20261018100000')
  ) or (select count(*) from nestly.algorithm_configurations) <> 1 then
    raise exception 'algorithm_configurations holds more than the seed: rolling back would delete a later version. Stop: forward fix, or Afik''s decision (CLAUDE.md hard rule 7)';
  end if;
end
$$;

-- these policies read post_hides and post_authors: they go first, so those tables can be dropped before posts
drop policy posts_select_viewer on nestly.posts;
drop policy posts_update_author on nestly.posts;
drop policy posts_delete_author on nestly.posts;

alter table nestly.posts drop constraint posts_anonymous_author_fkey;

drop table nestly.post_hides;

drop table nestly.post_authors;

drop table nestly.posts;

-- the guard trigger refuses DELETE, but dropping the table is not a DELETE
drop table nestly.algorithm_configurations;

drop function nestly.posts_insert_prepare();
drop function nestly.posts_insert_author();
drop function nestly.post_hides_insert_guard();
drop function nestly.algorithm_configurations_guard();

delete from supabase_migrations.schema_migrations where version = '20261018100000';

commit;
