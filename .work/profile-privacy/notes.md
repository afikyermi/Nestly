# notes — F2.3a profile-privacy (owner settings: c1–c6, c16)

**Approach**  Migration `20261017120000_profile_privacy.sql` + guarded down script: the settings half of schema.md only (three
`ADD COLUMN … NOT NULL DEFAULT` on `regular_profiles`, the column UPDATE grant, column comments, `regular_profiles_update_own`'s
comment names the three). Nothing of `profile_view`, its helper or its `TO app_owner` policies. Drizzle: the three columns on
`regularProfiles` + write model `regularProfilesPrivacyUpdate`; `PROFILE_VISIBILITIES` in shared constants; `checkPrivacySettings`
(`validation/privacy.ts`, strict). Server `GET`/`PUT /api/privacy`: route → `privacy-service` (one identity transaction each) →
`privacy-repository` (no WHERE; RLS confines), exactly the F2.1 shape. Web: `/settings` is now `SettingsPage` (h1 "הגדרות") with
one section, `PrivacySettingsSection` (flow) → `PrivacyContent` (one state); a text link "הגדרות פרטיות" on the profile page.
API and selectors for TEST ENGINEER: `interface.md`.

**Decisions**
- 400 body is exactly `{error:"invalid"}`, no `reason` (c3 wrote it so; a radio and two checkboxes cannot produce an invalid body,
  so the web has nothing to map).
- No-row answer reuses F2.1's `withoutProfile` (exported from `profile-service.ts`, type `NoProfileOutcome`): the settings live on
  the same row, so 403/404 mean the same as on `/api/profile`.
- Headings: the page keeps h1 "הגדרות" and title "הגדרות · Nestly" (PG-038 is SettingsPage; the F1.2 e2e pin that h1); the section's
  h2 is "פרטיות", the Q1 screen title. F2.5 may wrap it in its "פרטיות ואבטחה" section.
- The two toggles are the existing native `Checkbox` (state exposed by the platform), not a new switch component; the
  visibility choice is `ChoiceCardGroup` (radiogroup + legend + description line per option). No new component.
- In flight the radios and checkboxes are `disabled` and Save is `pending` + `aria-disabled` (F2.1's Save): what is on screen is what
  was sent, so the success answer never overwrites a change made during the request; a second press is dropped by a ref set
  synchronously. On success the values become the server's answer and "הפרטים נשמרו" shows; any later change hides it.
- Focus: after a failed save → the alert; after a successful retry → the checked radio; after a save, it stays on Save.
- Copy beyond c1/c4 (Q1 default): legend "צפייה בפרופיל"; descriptions "מי שאינם חברים רואים את כל הפרופיל. על ילדים והריון מוצג רק
  תקציר המסע" / "מי שאינם חברים רואים רק שם, תמונה ותקציר מסע ללא גילאים" (from §1.4, plural, gender-neutral); loading "טוענים את
  הגדרות הפרטיות", saving "שומרים" (F2.1 pattern); the profile link "הגדרות פרטיות". Record at I2's close or change.

**Deviations**  none from spec.md c1–c6/c16. From schema.md: only the approved split (no `profile_view`); the rollback's
error text says "drop a parent's choice … reopen a Restricted profile, re-share a withheld birthday" since the guard also fires on
the two booleans.

**Deliberately not done**  c7–c15 and everything `profile_view` (DR-G1, reserved). `ci/rls-gate.sql` unchanged (no new definer).
No test files (TEST ENGINEER) and no baselines (the three new `visual-screens.ts` entries fail until `update-baselines` runs). Knowledge
files `data-model.md` / `data-model-tables.md` (DATA ARCHITECT). SRS texts for Q1 (ORCHESTRATOR at I2's close). The per-feature
`call()` in `services/api/{profile,journeys,privacy}.ts` is now three copies of the same fetch/401/403/parse shape — an extraction to
propose, not done here.

**Uncertain**
- The descriptions are mine (Q1 "explanations quote §1.4"), and the Restricted one names "תמונה", which does not exist before I5;
  §1.4 lists it in the Basic Public Profile, so it is quoted.
- In the e2e build `/settings` now shows the load-failure alert (no access token), where it showed the placeholder line. The F1.2
  shell/guard e2e that open `/settings` check the h1, focus and nav, which are unchanged; I did not run the browser suites.

**Local checks**  typecheck · lint · check:budgets · check:stories green. Unit: shared 288/288, web 1042/1042, server 598/599 — the
one failure is `tests/drift.test.ts` "exits 0 when the database has exactly the columns of schema.md": its APPROVED list (TE's
file, `:24-34`) still has five `regular_profiles` columns (FINDING below). TE's `privacy-route.test.ts` 22/22. DB on the local PG16
stand-in (scratchpad `localdb.sh`): up → down → up OK (fingerprint restored), drift none (125 columns / 9 tables), pgTAP all green
incl. TE's 52 and the amended 10/20/50, except 01/02 (PG16 has no MAINTAIN, known). Guard checked by hand (`guardcheck.sh`): the four
fixture rows read open/true/true after the migration; one row set `is_child_birthday_shared=false` → the down script raises and
nothing is dropped (8 columns, FORCE RLS still on). Server `test:db` (`dbtest.sh`): privacy, privacy-backfill, profile, registration
146/146.

**FINDING for TEST ENGINEER (not edited)**  `apps/server/tests/drift.test.ts:24-34` APPROVED needs the three columns
(`profile_visibility text not null`, `is_empty_journey_sentence_shown boolean not null`, `is_child_birthday_shared boolean not null`),
or the drift test fails against the real schema.

**Preview path**  After the batched migration: sign in as a Regular parent → "פרופיל" → "הגדרות פרטיות" (or menu → "הגדרות") →
"פרטיות": "פרופיל פתוח" selected, both checkboxes ticked → choose "פרופיל מוגבל", untick both → "שמירה" → "הפרטים נשמרו" → reload:
same values. Without the migration on the preview DB, GET and PUT are 500 → "לא הצלחנו לטעון את הגדרות הפרטיות…" (fails closed).

**Fix after TE (a11y, c16)**  The radios' accessible name was the label plus the explanation line (ChoiceCardGroup put the
description inside the `<label>`). Now each input has `aria-labelledby` → its option-label span and `aria-describedby` → its
description span; the DOM and the look are unchanged, the native label still selects on click. Shared component, so every
ChoiceCardGroup gets it (no other caller passes a description today). Re-run: `e2e/privacy.spec.ts` 24/24; a11y on the privacy and
choice-card stories; `part-d`, `register-step1`, `touch` 243/243 (scratch Chromium config); web unit 1042/1042; typecheck, lint,
check:stories green.

**Fix after CI (PR 42, axe target-size at 375)**  The "הגדרות פרטיות" link was the page's last element. In
`journeys.spec.ts` "journey-save-failed (375)" the page ends up at scrollY 333, which puts the link at y 771–815: partly under the
sticky bottom navigation (739–812). axe reported "partially obscured (104×11)". Reproduced with a scratch script
(scratchpad `diag-link.mjs`). Fix: the link moved from after "המסע שלי" to right after the profile block (same component, same gap).
That state now passes. Caveat: whether a target is obscured depends on the scroll position. At that same scroll the moved link sits
under the sticky top bar (−5..39, fully covered, which axe skips). Any target near the viewport edge can be covered by the shell's
sticky bars. Re-run: journeys + profile + privacy specs 128/128, web unit 1042/1042, typecheck, lint. Visual baselines are story-based
(ProfileContent, JourneysContent), so they do not change.

**Neighbouring**  The shell's sticky top bar and bottom navigation (F1.2) can cover a focused or scrolled-to target at 375. There is
no `scroll-padding` for them (WCAG 2.4.11, focus not obscured). Not caused here, not fixed.
