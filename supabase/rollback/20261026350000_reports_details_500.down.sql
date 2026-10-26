-- =====================================================================================================================
-- Down script for supabase/migrations/20261026350000_reports_details_500.sql: restores reports_details_length_check at 1,000 code points
-- and both comments verbatim as 20261019200000_feed_i3_rest.sql set them. Outside supabase/migrations on purpose: the CLI never applies it.
--
-- Run as:   app_owner, in one transaction. CI runs it once per build (up -> down -> up) against the disposable database.
--           Against nestly-preview or nestly-prod: Afik only.
-- Safe:     always: every row the migration's CHECK accepts is at most 1,000 code points, so the restored CHECK validates; no data.
-- Restores: the 1,000 CHECK and the two comments; the history row is deleted.
-- =====================================================================================================================

begin;

do $$
begin
  if current_user <> 'app_owner' then
    raise exception 'the reports details 500 down script must run as app_owner (current_user is %)', current_user;
  end if;
end
$$;

alter table nestly.reports drop constraint reports_details_length_check;

alter table nestly.reports
  add constraint reports_details_length_check check (char_length(details) <= 1000);

comment on constraint reports_details_length_check on nestly.reports is
  'VAL (F3.7 c3, Q1): details is at most 1,000 characters (code points); NULL passes. The server''s Zod refuses first.';

comment on column nestly.reports.details is
  'Optional text; required for other. Not blank (reports_details_check); cap 1,000 code points (reports_details_length_check, F3.7 Q1).';

delete from supabase_migrations.schema_migrations where version = '20261026350000';

commit;
