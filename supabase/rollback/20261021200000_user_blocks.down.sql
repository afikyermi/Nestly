-- =====================================================================================================================
-- Down script for supabase/migrations/20261021200000_user_blocks.sql (I4, FR-REL-002).
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     only while user_blocks is empty (refuses otherwise): a block is data people rely on. Revert the code first.
-- Restores: the hiding policies, the trigger, the helper and the table go; notify_deliver loses the block check; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the user_blocks down script must run as app_owner (current_user is %)', current_user;
  end if;
  if exists (select 1 from nestly.user_blocks) then
    raise exception 'user_blocks holds a row: the down script refuses';
  end if;
end
$$;

-- notify_deliver back to the I7 body (no block check).
create or replace function nestly.notify_deliver(p_recipient uuid, p_type text, p_category text, p_actor uuid,
                                                 p_target_kind text, p_target_id uuid, p_subject uuid, p_is_critical boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_recipient is null then
    return;
  end if;
  if not p_is_critical and exists (
    select 1 from nestly.notification_preferences p
    where p.user_id = p_recipient and p.category = p_category and not p.is_in_app_enabled) then
    return;
  end if;
  insert into nestly.notifications (recipient_id, type, actor_id, target_kind, target_id, subject_id, is_critical)
  values (p_recipient, p_type, p_actor, p_target_kind, p_target_id, p_subject, p_is_critical)
  on conflict (recipient_id, type, subject_id) do nothing;
end
$$;

drop policy friendships_block_update on nestly.friendships;
drop policy friendships_block_insert on nestly.friendships;
drop policy regular_profiles_block_hide_owner on nestly.regular_profiles;
drop policy regular_names_block_hide_owner on nestly.regular_names;
drop policy regular_names_block_hide on nestly.regular_names;
drop policy regular_names_select_blocker on nestly.regular_names;
drop policy comments_block_hide on nestly.comments;
drop policy posts_block_hide on nestly.posts;
drop table nestly.user_blocks;
drop function nestly.user_blocks_end_relations();
drop function nestly.is_blocked_pair(uuid);

delete from supabase_migrations.schema_migrations where version = '20261021200000';

commit;
