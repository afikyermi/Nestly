-- =====================================================================================================================
-- Own account row readable in every status — I1 F1.5 part a. users_select_own loses `and status = 'active'`: an account
-- reads its own users row (id, account_type, status, created_at) whether it is active, suspended or banned, so GET /api/me
-- can tell a stopped account from an Auth user with no row.
--
-- Source: .work/login-session/schema.md (Gate 2, passed 15.10.2026; decisions/2026-10.md, "F1.5 Gate 1", DR-1 A).
-- SRS: FR-AUTH-002 · FR-MOD-002 · BR-024 · NFR-SEC-002. Platform rules 10, 14, 15 (.claude/knowledge/data-model.md).
--
-- Nothing else changes: every other table still gates its SELECT and INSERT on is_active_account(), which checks
-- id and status itself, so a stopped account reads zero rows of them from the next statement. No table, column, grant,
-- function, index or role changes.
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261015100000_users_select_own_any_status.down.sql.
-- =====================================================================================================================

alter policy users_select_own on nestly.users
  using (id = (select auth.uid()));

comment on policy users_select_own on nestly.users is
  'An account reads its own row only, whatever its status (NFR-SEC-002, layer 1; F1.5 DR-1 A): the caller learns its own state and nothing more. Every other table gates on is_active_account() (platform rule 15). No function that reads users.';
comment on column nestly.users.status is
  'Whether the account may use the product now: active, suspended or banned (FR-MOD-002, BR-024). Anything but active reads nothing but its own users row, from the next statement (platform rule 15; F1.5 DR-1 A). A warning is not a status.';
