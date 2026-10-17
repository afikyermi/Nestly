# findings — F2.4c2 (CRITIC, opus, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: medium
file:     e2e/visual-screens.ts:1644-1651
claim:    a duplicate block of six user-profile entries with assumed, non-existent story ids — the unique-name check fails, baselines empty.
status:   fixed 17d701a (the block was removed in the working tree before the review diff was cut; committed after)

--- bug ---
severity: medium
file:     apps/web/src/app/access.ts:42-52 · apps/web/src/app/RouteGuard.tsx:101-131
claim:    c27 works for password sign-in only: the return target lives in router state and is lost in the Google OAuth round trip
          (navigation.assign → fresh load on PATHS.googleEntry) — the Guest lands on SIGNED_IN_LANDING, not the profile.
decision: ORCHESTRATOR, 17.10 — neither (a) `redirectTo` with a `next` parameter (the Supabase redirect allowlist is Afik's setting; an
          exact-URL entry would break Google sign-in) nor (b) descoping c27. Fix: a one-shot `sessionStorage` entry, written only
          right before the Google redirect and only when the current return target passes `userIdOfProfilePath` (`/u/<uuid>` only);
          read once and removed on the googleEntry landing, re-validated, ignored after 10 minutes; removed on sign-out. Spec
          clarification amended ("never storage" except this one key). Test: Guest → /u/B → Login → Google (stubbed) → B's profile;
          a tampered/expired/non-profile entry → the landing; the key is gone after landing and after sign-out.
status:   fixed c8c7805, tests in e2e/user-profile-google.spec.ts — validated by CRITIC 17.10

--- bug ---
severity: low
file:     e2e/support/profiles-stub.ts:55 (with e2e/support/journeys-stub.ts:85)
claim:    the stubbed access token is not a JWT, so `sub` is absent and the c26/DR-O tests fail for a fixture reason.
status:   fixed (JWT-shaped stub token) — validated by CRITIC 17.10

--- bug --- (CRITIC re-check, 17.10)
severity: low
file:     apps/web/src/hooks/use-google-sign-in.ts:1433 · apps/web/src/app/App.tsx:48-52
claim:    a note left by a Google start that never came back survives a plain Google start and any fresh load, until a sign-out.
failure:  Guest A: /u/X → Login → Google → Back. Within 10 min user B in the same tab: plain Login → Google → lands on X (learns A's target).
fix:      every Google start replaces the note (write with a target, remove without); every fresh load removes it, used only on googleEntry.
status:   open -> BUILDER (fixed in this part — a privacy leak, cheap) · TEST ENGINEER (test)
