-- =====================================================================================================================
-- The recovery lock ladder — I4 (NFR-SEC-010, AC-113; Afik 20.10.2026, replacing the 17.10 ladder with its permanent step).
--
-- recovery_throttles  gains the per-account ladder (handles only): ladder_failures counts the failures since the last success
--                     (no window). The server (as app_recovery, for the declared handle only) applies the ladder: the 3rd failure
--                     locks recovery for 1 hour, the 6th for 24 hours, and after that every further failure locks it again for
--                     24 hours, until a success, which resets the count to 0. There is no permanent lock and nothing to release.
--                     The lock itself is the existing locked_until. The IP limit is unchanged.
-- app_recovery        gains exactly one privilege: UPDATE of the ladder column ladder_failures (column level). Nothing else changes:
--                     no new table, no policy, no function, no trigger. authenticated still holds nothing on recovery_throttles.
--
-- Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261021300000_recovery_lock_ladder.down.sql.
-- =====================================================================================================================

alter table nestly.recovery_throttles
  add column ladder_failures smallint not null default 0;

alter table nestly.recovery_throttles
  add constraint recovery_throttles_ladder_check check (ladder_failures >= 0 and (subject_kind = 'handle' or ladder_failures = 0));

grant update (ladder_failures) on table nestly.recovery_throttles to app_recovery;

comment on column nestly.recovery_throttles.ladder_failures is
  'NFR-SEC-010: failures since the last success, handles only (0 for an IP). The 3rd locks recovery for 1 hour, the 6th and every later one for 24 hours (locked_until); a success resets it to 0. Written by app_recovery (column grant).';
comment on constraint recovery_throttles_ladder_check on nestly.recovery_throttles is
  'The ladder belongs to handles: an IP row keeps 0.';
