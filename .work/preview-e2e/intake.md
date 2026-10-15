# E — Preview E2E (intake)

**Source:** decisions/2026-10.md — "Development speed" (E), and the 2026-10-16 entry "F1.6 merges on automated Preview
E2E (E)". Afik, 16.10.2026, in chat: every CI run creates a new user with random details, walks the feature's full flow
on the Preview, and deletes the user at the end. The goal is that Afik never checks a Preview by hand again. Overnight
instructions: build E to the end, including F1.6's flow, and run it. If everything is green, prepare F1.6 to merge, but
do not merge to main and do not touch production.

**Where:** on `feat/f1-6-password-recovery` (PR 31), not as a separate PR. Afik forbade any merge to main tonight, and
E has to test F1.6's own Preview. (ORCHESTRATOR, recorded in decisions.)

**Path:** Elevated. Flags: a new credential with deletion power over nestly-preview in CI, and a destructive operation
(it deletes test users) on the preview database. Production is never in scope.

**Secrets (Afik, environment `preview-e2e`, no reviewers, no branch restriction):**
- `PREVIEW_SUPABASE_SECRET_KEY` — nestly-preview secret key (Auth admin API)
- `PREVIEW_DB_ADMIN_URL` — nestly-preview, `postgres` user, session pooler (port 5432)
- existing repository secret: `VERCEL_AUTOMATION_BYPASS_SECRET`

The nestly-preview project ref is `xmihorrkegrdlbhpktny` (public, WORKPLAN "שינויים בדפדפן" 14.10). Any credential or URL
that does not resolve to that ref must stop the job before it connects.

**What exists to reuse:**
- `.github/workflows/preview-smoke.yml` — the deployment_status trigger, the vercel[bot] and Preview filters, the
  deployment-URL rule, and the bypass header handling.
- `tools/preview-shot.mjs` — the bypass cookie (`x-vercel-set-bypass-cookie`).
- `tools/migrate-url-guard.mjs` — the database URL guard.
- `e2e/recovery-web.spec.ts` — F1.6's flows against the local e2e build. The flow on the Preview is the real one, with
  real Supabase Auth and the real server.

**F1.6 flow on the Preview** (it replaces Afik's manual checklist; F1.6 spec: `.work/password-recovery/spec.md`):
1. Sign up a new user → the questions screen opens immediately, with no "later". Going to the feed, or reloading, brings
   the user back to it.
2. Pick 2 of the 3 questions, answer them, save → the feed.
3. Log out and sign in again → the questions screen does not appear.
4. Menu "שאלות לשחזור סיסמה": wrong current answers → an error; correct answers → a confirmation.
5. Log out → "שכחתי סיסמה" (`/recovery`): email, both answers and a new password → the password is updated. Wrong
   answers → a message, and the password field is cleared.
6. Sign in with the new password.

Run the flow at phone width (375) and on desktop. Cleanup always runs, including after a failure, and also removes
leftovers from earlier failed runs (test users only, identified by a reserved email pattern).
