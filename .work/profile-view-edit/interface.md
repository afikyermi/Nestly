# interface — F2.1 profile-view-edit, for TEST ENGINEER

## Server — `apps/server/src/routes/profile.ts` (registered in `buildApp`, `apps/server/src/app.ts`)

Protected: no/invalid token → 401 `{error:'unauthenticated'}` + `www-authenticate: Bearer`, from the auth hook, before any
handler and before any transaction (c12). Every answer of the route carries `cache-control: no-store`. No id in path, query or body.

| Route | Body | Answers |
|---|---|---|
| `GET /api/profile` | — | 200 `{ fullName: string, parentGender: 'woman'\|'man'\|'other'\|'prefer_not_to_say'\|null }` · 403 `{error:'account_unavailable'}` (users row visible, status ≠ active: suspended/banned, c11) · 404 `{error:'no_profile'}` (no users row: unregistered, c12/Q4; also an active account with no profile row) · 401 stale / 503 pending (session guard, `replySessionRefused`) · 503 `{error:'unavailable'}` (transient DB failure, or no DB configured) · 500 `{error:'internal'}` |
| `PUT /api/profile` | strict `{ fullName: string, parentGender: <4 values> \| null }` | 200 the stored values, same shape as GET (fullName trimmed) · 400 `{error:'invalid', reason}` before any DB work · 403 / 404 / 401 / 503 / 500 as GET (404: nothing created) |
| any other method (`POST`, `PATCH`, `DELETE`, `OPTIONS`) | — | 405 `{error:'method_not_allowed'}`, `allow: GET, PUT` (after auth, like `/api/me`) |

`reason` (`PROFILE_UPDATE_REASONS`, `packages/shared/src/validation/profile.ts`): `full_name_required` (empty or spaces only) ·
`full_name_length` (1 or > 60 code points after the space trim; raw string > 600 UTF-16 units) · `parent_gender_invalid` (not one of the
four and not null; also a missing `parentGender`) · `invalid_body` (any unknown key — `userId`, `user_id`, `accountType`, `createdAt` —,
missing `fullName`, a non-string name, a non-object body). A body that is not JSON → 400 `{error:'bad_request'}` (global handler) / 415.

Shared: `profileUpdateRequest` (Zod strict object), `checkProfileUpdate(body) → {ok:true, value:{fullName, parentGender}} |
{ok:false, reason}`, types `ProfileUpdate`, `OwnProfile`, `ProfileUpdateReason`. Exported from `@nestly/shared`.

Layers: route → `services/profile-service.ts` (`readOwnProfile`, `updateOwnProfile`, one identity transaction each; `ProfileFault`
on >1 row → 500) → `repositories/profile-repository.ts` (`readOwnProfiles`: SELECT with no WHERE, limit 2; `updateOwnProfiles`:
`tx.update(regularProfilesUpdate).set({fullName, gender}).returning(...)`, no WHERE). 0 rows → the `users` status read
(`readOwnStatuses`) decides 404 vs 403. Write model `regularProfilesUpdate` in `apps/server/src/db/schema.ts`.

Logs (fixed lines, `{sqlstate}` only): `profile read failed` · `profile update failed`. The request line is method + route pattern
(`serializers.req`). Name, gender, token, ids and the body are never logged (c14). Test seam: `buildApp({ database, logStream })`.

## Database — `supabase/migrations/20261017100000_regular_profiles_update_own.sql`

`grant update (full_name, gender) on nestly.regular_profiles to authenticated` · policy `regular_profiles_update_own` (for update,
to authenticated, USING and WITH CHECK `user_id = (select auth.uid()) and (select nestly.is_active_account())`) · policy comment.
Down: `supabase/rollback/20261017100000_regular_profiles_update_own.down.sql` (app_owner guard; drop policy, revoke, history row).

## Web — `PATHS.profile` (`/profile`), inside the shell (`ProtectedLayout`)

Page `apps/web/src/pages/profile/ProfilePage.tsx` → feature `apps/web/src/features/profile/ProfileScreen.tsx` (container),
`ProfileView.tsx`, `ProfileEditForm.tsx`, texts and form check in `profile-texts.ts`, `profile-form.ts`. API calls
`apps/web/src/services/api/profile.ts`: `fetchOwnProfile(token)`, `saveOwnProfile(token, {fullName, parentGender})`. The token is
`useSessionAccount().getAccessToken()`; with no session account (the e2e test source) or a null token the screen shows the load
failure (GET) / save failure (PUT) — so the screens are Storybook entries, not app entries.

h1 and `<title>` "פרופיל" in every state. `data-testid`s:

| State | What renders |
|---|---|
| loading (`profile-loading`) | skeletons (aria-hidden) + `role=status` "טוענים את הפרופיל"; no value, no "עריכה" |
| load failed (`profile-load-failed`) | `role=alert` "לא הצלחנו לטעון את הפרופיל. אפשר לנסות שוב" + button "נסו שוב" (repeats GET, back to loading) |
| view (`profile-view`) | `<dl>`; rows `profile-full-name` "שם מלא: <name>" (name in `<bdi dir="auto">`) and `profile-parent-gender` "מין ההורה: <label>"; labels אישה · גבר · אחר · מעדיפים לא לציין, NULL → "לא צוין"; button "עריכה" |
| edit (`profile-edit`, a `<form>`) | FormField "שם מלא" (TextInput, `autocomplete=name`), FormField "מין ההורה" + "(לא חובה)" (native select: first option "לא צוין" value `""`, then the four); buttons "שמירה" (submit) and "ביטול" (back to view, nothing sent). Focus goes to the name input on open, to "עריכה" on cancel/save |
| edit errors | after the first "שמירה" only, live after that: "יש למלא שם מלא" / "שם מלא צריך להכיל 2 עד 60 תווים" under the field (`aria-invalid`, `aria-describedby` → `<id>-error`); focus to the first invalid field; no PUT |
| saving | "שמירה" `aria-disabled=true` + loader, sr-only `role=status` "שומרים"; a second press sends nothing |
| save failed | the form stays with the input; `role=alert` "השמירה לא הצליחה. אפשר לנסות שוב" (on 5xx, network, 400, 404, null token) |
| saved | back to view with the stored values; the screen's `role=status` (`profile-status`) reads "הפרטים נשמרו" |

401 on GET or PUT → `account.recheck()` (GET /api/me → 401 ends the session "expired" → login "ההתחברות פגה. אפשר להתחבר שוב", c16).
403 `account_unavailable` → alert with ERR-037 "הכניסה לחשבון הזה אינה זמינה כרגע" (on load: no "נסו שוב") and `account.recheck()` (→ `/api/me`
`unavailable` → session ends "stopped" → login with the same text, c11). A token refused on refresh ends the session in the source
already (`refresh-refused`).

**Stories.**
States from props: `apps/web/src/features/profile/ProfileContent.stories.tsx` (title `features/profile/ProfileContent`): `View`, `ViewNotAnswered`, `ViewPreferNotToSay`, `Saved`, `Loading`, `LoadFailed`, `AccountStopped`, `Edit`, `EditErrors`, `Saving`, `SaveFailed`. Flows (fetch stubbed): `ProfileScreen.stories.tsx` — `Loaded`, `LoadFailsThenRetries`, `EditAndSave`, `SaveWithErrors`, `SaveFails`.
`e2e/visual-screens.ts` story entries: `profile-view`, `profile-edit`, `profile-edit-errors`, `profile-load-failed`,
`profile-edit-save-failed` (ids `features-profile-profilecontent--view|edit|edit-errors|load-failed|save-failed`).
`GENDER_LABELS` / `GENDER_OPTIONS` moved from `RegisterStepOne.tsx` to `apps/web/src/lib/profile-fields.ts` (shared by both, with the two VAL-001 texts).
