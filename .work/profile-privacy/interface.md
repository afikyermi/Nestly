# interface — F2.3a profile-privacy (owner settings), for TEST ENGINEER

Scope: spec.md c1–c6, c16. The cross-user read (`profile_view`, c7–c15) is not built (DR-G1, reserved).

## Database — `supabase/migrations/20261017120000_profile_privacy.sql` · down `supabase/rollback/20261017120000_profile_privacy.down.sql`

`nestly.regular_profiles` + three columns, each `NOT NULL DEFAULT` (catalog-only backfill, no row written):
- `profile_visibility text not null default 'open'`, constraint `regular_profiles_profile_visibility_check` (`'open' | 'restricted'`)
- `is_empty_journey_sentence_shown boolean not null default true`
- `is_child_birthday_shared boolean not null default true`

Grant: `UPDATE (profile_visibility, is_empty_journey_sentence_shown, is_child_birthday_shared)` to `authenticated`, under the
existing `regular_profiles_update_own` (own row, `is_active_account()`); its comment now names the three. No INSERT grant on the
three (registration cannot send them), no DELETE grant, no new policy, no function. The column count of `regular_profiles` goes
from 5 to 8 — structure files that pin the column list or the UPDATE grants (`10_identity_structure.sql`, `20_registration_structure.sql`,
`50_profile_update.sql`, per schema.md "Amend in the same PR", minus everything about profile_view) are yours.

Rollback: app_owner only; lifts FORCE RLS on regular_profiles, **raises** if any row has `profile_visibility <> 'open'` or either
boolean false; FORCE back; restores the F2.1 policy comment; revokes the three UPDATEs; drops the three columns; deletes history
row `20261017120000`. Touches no row.

## Server — `apps/server/src/routes/privacy.ts` (registered in `buildApp`, `apps/server/src/app.ts`)

Protected: no/invalid token → 401 from the auth hook, before any handler or transaction. Every answer carries `cache-control: no-store`.
No user id in path, query or body.

| Route | Body | Answers |
|---|---|---|
| `GET /api/privacy` | — | 200 `PrivacySettings` · 403 `{error:'account_unavailable'}` (suspended/banned) · 404 `{error:'no_profile'}` (no users row; an active non-Regular account) · 401 stale / 503 pending (session guard) · 503 `{error:'unavailable'}` (transient DB failure, no DB configured) · 500 `{error:'internal'}` |
| `PUT /api/privacy` | strict `PrivacySettings` | 200 the stored `PrivacySettings` · **400 `{error:'invalid'}` exactly** (no `reason`), before any database work: a visibility outside open/restricted, a non-boolean toggle, a missing key, any extra key (`userId`, `user_id`, `searchable`, `hiddenFromSearch`, …), a non-object · 403 / 404 `no_profile` (0 rows updated, nothing created) / 401 / 503 / 500 as GET |
| other methods | — | 405 `{error:'method_not_allowed'}`, `allow: GET, PUT` (after auth) |

`PrivacySettings` = `{ profileVisibility: 'open'|'restricted', isEmptyJourneySentenceShown: boolean, isChildBirthdayShared: boolean }`.
A non-JSON body → 400 `{error:'bad_request'}` (global handler) / 415, as every route.

Layers: route → `services/privacy-service.ts` (`readOwnPrivacy`, `updateOwnPrivacy`; one identity transaction each; 0 rows →
`withoutProfile` from `profile-service.ts`: users row status → 403 or 404; >1 row → `PrivacyFault` → 500) →
`repositories/privacy-repository.ts` (`readOwnPrivacySettings` select of the three, no WHERE, limit 2; `updateOwnPrivacySettings`
= `update(regularProfilesPrivacyUpdate).set(three).returning(three)`, no WHERE). Logs: fixed lines `privacy read failed` ·
`privacy update failed`, `{sqlstate}` only. Test seam: `buildApp({ database, logStream })`.

Drizzle (`apps/server/src/db/schema.ts`): `regularProfiles` + `profileVisibility`, `isEmptyJourneySentenceShown`,
`isChildBirthdayShared`; write model `regularProfilesPrivacyUpdate` (the three). Drift covers both.

## Shared — `packages/shared/src/validation/privacy.ts`, `constants/identity.ts`

`PROFILE_VISIBILITIES = ['open', 'restricted']`, `ProfileVisibility` · `privacySettingsRequest` (`z.strictObject`) ·
`privacySettingsResponse` (`z.object`) · `checkPrivacySettings(body) → {ok:true, value} | {ok:false}` · type `PrivacySettings`.

## Web

- Route `PATHS.settings` (`/settings`) → `apps/web/src/pages/settings/SettingsPage.tsx`: h1 **"הגדרות"** (unchanged, the F1.2 e2e
  expect it), document title "הגדרות · Nestly", then the section. Replaces the Settings placeholder.
- Section `apps/web/src/features/privacy/PrivacySettingsSection.tsx` (flow) → `PrivacyContent.tsx` (one state from props) ·
  texts `privacy-texts.ts` · API `apps/web/src/services/api/privacy.ts` (`fetchPrivacySettings`, `savePrivacySettings`).
- `<section aria-labelledby>` with h2 **"פרטיות"** (Q1 title). One `role="status"` region (`data-testid="privacy-status"`):
  "טוענים את הגדרות הפרטיות" (sr-only) while loading, "שומרים" (sr-only) in flight, "הפרטים נשמרו" visible after a save.
- Loading: `data-testid="privacy-loading"`, skeletons only, no control and no value.
- Load failure: `data-testid="privacy-load-failed"`, `role="alert"` "לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב" + button
  "נסו שוב" (focus → message after a failed retry, → the checked radio after a successful one). 403 → ERR-037 text, no retry.
- Form `data-testid="privacy-form"`: radio group (`role="radiogroup"`, legend "צפייה בפרופיל"), radios named "פרופיל פתוח" /
  "פרופיל מוגבל", each with its description line; native checkboxes "הצגת המשפט כשאין ילדים והריון" and "יום הולדת של ילד בהתראות
  לחברים"; one submit "שמירה". In flight: Save `aria-disabled` + `aria-busy`, a second press sends nothing; the radios and
  checkboxes are `disabled`. Save failure: `role="alert"` "השמירה לא הצליחה. אפשר לנסות שוב" above the controls, values kept, focus
  on the message. 401 → `recheck()` (ERR-038 via the session guard) + the save-failure text; 403 → recheck + ERR-037 text.
- Profile page link: a text link "הגדרות פרטיות" → `/settings` (below "המסע שלי"), until F2.5 (Gate 1 DR-2 A).
- Stories: `features/privacy/PrivacyContent` (Defaults, Changed, Saving, Saved, SaveFailed, Loading, LoadFailed, AccountStopped) ·
  `features/privacy/PrivacySettingsSection` (flows). `e2e/visual-screens.ts`: `privacy-settings` (…--defaults),
  `privacy-settings-load-failed` (…--load-failed), `privacy-settings-save-failed` (…--save-failed). No baselines.
- In the e2e build `/settings` has no access token, so the section shows the load failure (as the profile page does).
