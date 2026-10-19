-- =====================================================================================================================
-- Down script for supabase/migrations/20261019300000_commenter_names.sql (I3 F3.4 N1; .work/i3-rest-schema/schema.md "Rollback").
-- Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod it is a destructive change: Afik only (CLAUDE.md hard rule 7).
-- Safe:     at any time: the policy holds no data and nothing depends on it. No code revert is needed first.
-- Effect:   a stranger loses commenter names again (decision A shape: name only via self, Friendship parties or a readable post).
-- Restores: drops the policy and restores the post_hides table comment (20261018100000 text); deletes only its own history row.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the commenter_names down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

drop policy regular_names_select_comment_reader on nestly.regular_names;

comment on table nestly.post_hides is
  'Afik 7א: a viewer''s own hide of a post. Read and written by its owner only; no policy, function or view depends on it except posts_select_viewer; never a ranking input.';

delete from supabase_migrations.schema_migrations where version = '20261019300000';

commit;
