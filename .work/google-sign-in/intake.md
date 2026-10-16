# intake — F1.8 google-sign-in

**Intent**        Afik, 17.10: "תתחיל את F1.8, התחברות עם Google, לפי WORKPLAN". WORKPLAN "להמשך" 0 · I1 Addendum 1
                  (`.work/_initiatives/I1-accounts-access.md`, "New F1.8"). Rides with it: the approved guard-freeze
                  exception — TEST ENGINEER may write `e2e-preview/*.flow.ts` (`decisions/2026-10.md`, 2026-10-17), with a
                  guard test and CRITIC on opus; and F1.8's own flow file in `e2e-preview/`, so Gate 3 passes from `preview-e2e`.

**Problem**       A parent who would rather not create a password cannot join or come back: Welcome, Login and the
                  registration screens offer only email and password.

**Requirements**  FR-AUTH-005 (`docs/srs/05-functional/auth.md:61`) · AC-087 (`15-acceptance.md:93`) · FR-AUTH-002 status
                  checks after sign-in (same file :25–30; AC-099, AC-100, AC-101) · FR-REG-002 step 1 and FR-REG-004 consent
                  and 18+ without a password (`05-functional/registration.md:53`; AC-088) · BR-045 email unique across
                  accounts (`08-business-rules.md`) · ERR-001 non-revealing messages (`10-errors-edge-cases.md`) · §12
                  External Login row (`12-external-interfaces.md:19`) · NFR-SEC-009 session storage.

**Open items**    1. **Linking a Google sign-in to an existing account with the same email** — FR-AUTH-005 delegates the
                     exact rule to the feature design, checked by CRITIC: no link without proof the account belongs to the
                     requester (pre-account takeover: emails are not verified at sign-up, AC-091). SPEC states the rule
                     and the Supabase Auth setting it depends on (automatic identity linking treats an auto-confirmed
                     email identity as verified). If the safe rule changes what a user can do beyond the SRS text, it is a
                     DECISION REQUEST at Gate 1 — ORCHESTRATOR's unless it changes the security model (then Afik).
                  2. **Supabase URL Configuration** (Site URL, Redirect URLs for production and Vercel previews) cannot
                     be read from here — Afik's dashboard. Not blocking SPEC; goes to Afik's single list.
                  No reserved item open.

**Risk flags**    authentication/authorization: **true** — a new sign-in and sign-up method, identity linking ·
                  personal data: **true** — the email from Google; the avatar must not be imported ·
                  schema migration: **possible** — only if the account must record the sign-in method or the profile
                  step must accept a user with no password; DATA ARCHITECT decides · money: false ·
                  new external provider: **true** — Google (via Supabase Auth) ·
                  unauthenticated endpoint / new external surface: **true** — the OAuth redirect back into the app
                  (a provider callback URL, reachable before sign-in).

**Path**          Elevated.

**Team**          SPEC → ORCHESTRATOR Gate 1 → DATA ARCHITECT (always on Elevated; Gate 2 if schema or policy changes) →
                  BUILDER (+ the guard change, its test) ∥ TEST ENGINEER (from the spec; incl. `e2e-preview/<f18>.flow.ts`)
                  → CRITIC on opus (auth, personal data, new provider, guard edit) → Preview via `preview-e2e`. New UI (the
                  Google button on three screens, the return screen) → Accessibility and Design consistency domains.

**Size**          One spec; SPEC may split (a: auth/linking/guard — Elevated; b: screens — Standard), at most two reviews.

**Next owner**    SPEC
