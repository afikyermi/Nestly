-- =====================================================================================================================
-- The promotion settings' reason is the Admin's — I13 follow-up (FR-ALG-007, BR-059, §11.2), migration only.
--
-- SRS: FR-ALG-007 (the settings of promoted units, versioned, in the Admin's settings) · BR-059 (every version with a reason, audited) ·
--      §3.2 (BILLING_FINANCE_MANAGE is Admin Only) · FR-ADMIN-005 (the Audit Log).
--
-- promotion_settings   Every active account still reads the numbers of each version (the promoted units and the paid events' frequency
--                      cap read the newest one as the viewer). The free-text reason and the time of a version are no longer granted for
--                      SELECT to authenticated: they are read only through the version's Audit Log entry (promotion_settings_changed,
--                      reason and occurred_at), which only the Admin or AUDIT_LOG_VIEW reads (audit_log_select_viewer). created_by stays
--                      ungranted. INSERT is unchanged (BILLING_FINANCE_MANAGE, promotion_settings_insert_finance); RETURNING needs only version.
-- Phase: contract (two column grants revoked; no row or schema change). Down script:
-- supabase/rollback/20261023900000_promotion_settings_reason.down.sql (grants them again and deletes its history row).
-- =====================================================================================================================

revoke select (reason, created_at) on table nestly.promotion_settings from authenticated;

comment on column nestly.promotion_settings.reason is
  'Why the Admin added this version (1 to 500 characters). Not readable by authenticated: the Admin (or AUDIT_LOG_VIEW) reads it in the version''s Audit Log entry (promotion_settings_changed).';
comment on column nestly.promotion_settings.created_at is
  'When the version was added (stamped by promotion_settings_prepare). Not readable by authenticated: the Audit Log entry''s occurred_at is the readable time.';
