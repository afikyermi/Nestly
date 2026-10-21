-- =====================================================================================================================
-- A guide is published without a source check date -- I14 completion B follow-up (FR-ADMIN-012), migration only.
--
-- SRS: FR-ADMIN-012 (Afik 21.10.2026, decision 11.8: "תאריך בדיקת המקורות אינו תנאי לפרסום"; SRS 2.39) · BR-070 (Afik still approves every
--      guide before publication: publishing stays the Admin's, status_guides_update_admin unchanged) · AC-095.
--
-- status_guides   status_guides_published_check (published => source_checked_on and published_at) is replaced by
--                 status_guides_published_at_check (published => published_at): the source date becomes optional on a published guide; the
--                 publication time stays required (status_guides_prepare stamps it). Nothing else changes: grants, policies, the audit branch.
-- Phase: expand (a CHECK relaxed). Down script: supabase/rollback/20261023700000_guide_source_date_optional.down.sql (refuses while a published
-- guide has no source date, then restores the old CHECK).
-- =====================================================================================================================

alter table nestly.status_guides drop constraint status_guides_published_check;

alter table nestly.status_guides
  add constraint status_guides_published_at_check check (status <> 'published' or published_at is not null);

comment on constraint status_guides_published_at_check on nestly.status_guides is
  'A published guide has its publication time (stamped by status_guides_prepare). The source check date is optional (FR-ADMIN-012, Afik 21.10.2026).';
comment on policy status_guides_update_admin on nestly.status_guides is
  'The Admin edits, publishes and hides a guide (FR-ADMIN-012); a source check date is not required to publish (Afik 21.10.2026).';
