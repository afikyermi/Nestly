-- =====================================================================================================================
-- Profile privacy, the owner's settings — I2 F2.3a (profile-privacy).
--
-- Source: .work/profile-privacy/schema.md (Gate 2, ORCHESTRATOR 17.10.2026, "split": F2.3a approved); spec.md criteria 1-6.
-- Three settings per Regular account, as columns on regular_profiles (1:1, Regular-only by the composite FK, already behind
-- the own-row policies):
--   profile_visibility               open | restricted   (FR-PRIV-001, §1.4 Regular Profile Visibility), default open
--   is_empty_journey_sentence_shown  boolean             (§1.4 Journey Summary, OP-021), default true (shown)
--   is_child_birthday_shared         boolean             (§13 ChildBirthdayVisibility, BR-037), default true; stored only
-- Defaults are Afik's (I2 questionnaire 1, 2, 5). Backfill: ADD COLUMN ... NOT NULL DEFAULT <constant> is catalog-only (fast
-- default): every existing row, in any status, reads the defaults at once and no row is written. A new account gets them from
-- the defaults: registration names neither column, and no INSERT grant is added, so it cannot send them (criterion 6).
--   grant   UPDATE of the three to authenticated, per column, under the existing regular_profiles_update_own (own row, behind
--           nestly.is_active_account(), rule 15). No INSERT or DELETE grant, no new policy, no function.
-- The cross-user read (profile_view, F2.3b) is not here: it is reserved (DR-G1) and comes in a later migration that changes
-- none of this. Applied by the Supabase CLI as app_owner, in one transaction with its history row. Down script:
-- supabase/rollback/20261017120000_profile_privacy.down.sql.
-- =====================================================================================================================

alter table nestly.regular_profiles
  add column profile_visibility text not null default 'open'
    constraint regular_profiles_profile_visibility_check check (profile_visibility in ('open', 'restricted')),
  add column is_empty_journey_sentence_shown boolean not null default true,
  add column is_child_birthday_shared boolean not null default true;

grant update (profile_visibility, is_empty_journey_sentence_shown, is_child_birthday_shared)
  on table nestly.regular_profiles to authenticated;

comment on column nestly.regular_profiles.profile_visibility is
  'open or restricted: whether a non-Friend sees the full profile or only the Basic Public Profile (FR-PRIV-001, §1.4). Default open (Afik, I2 questionnaire 1). Never hides the account from People Search (VAL-027).';
comment on column nestly.regular_profiles.is_empty_journey_sentence_shown is
  'Whether the Journey Summary sentence for no children and no pregnancy is shown (§1.4, OP-021). Default true (shown).';
comment on column nestly.regular_profiles.is_child_birthday_shared is
  'SRS ChildBirthdayVisibility (§13): the parent allows a child''s birthday in notifications to Friends (BR-037). One switch per parent, default true (Afik, I2 questionnaire 5). Stored only; nothing reads it before I7.';

comment on policy regular_profiles_update_own on nestly.regular_profiles is
  'An active account edits its own full_name and gender (FR-PROFILE-001, F2.1) and its privacy settings profile_visibility, is_empty_journey_sentence_shown and is_child_birthday_shared (FR-PRIV-001, F2.3a). Other columns: no grant.';
