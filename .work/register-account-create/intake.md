# intake — register-account-create (I1, F1.4)

**Intent**        I1 → F1.4, as changed by Addendum 1 (Afik 13.10): registration step 2 — email and password, one
                  consent checkbox (Terms, Privacy, 18+), atomic creation of the account with step 1's data, signed in at
                  once. Afik 14.10: "תמשיך ל-F1.4".

**Problem**       A parent who filled step 1 (F1.3) cannot finish: nothing creates an account, nothing stores step 1, and
                  nothing records consent.

**Requirements**  FR-REG-004 (`docs/srs/05-functional/registration.md:47`) · VAL-002, VAL-003 (`09-validations.md:8-9`) ·
                  AC-002, AC-003, AC-055, AC-084, AC-088, AC-091 (`15-acceptance.md`) · ERR-002 (`10-errors-edge-cases.md:8`)
                  · BR-045 (`08-business-rules.md:51`), BR-068 · entities Child, JourneyContext, LegalConsent (with
                  F1.1's User and RegularProfile, `.claude/knowledge/data-model.md`) · NFR-SEC-006 (enumeration, layer 13)
                  · F1.3 debt: step-1 server schema `.strict()` and size-bounded (Gate 2, `debt.md`) · R2 registration
                  screen step 2 (`docs/design/mockups/r2-screens.html`).

**Open items**    1. **DECISION REQUEST → Afik (reserved: security model, material SRS wording).** FR-REG-004 says a taken
                  email gets a message that "does not reveal an account exists"; ERR-002 says "suggest login/recovery";
                  AC-091 says the account is signed in at once with no email verification. Without verification these
                  cannot all hold: a sign-up either signs you in or it does not, and that difference reveals the email.
                  (Supabase hides it only when confirm-email is on.) See the options in WORKPLAN "ממתין להחלטה שלך".
                  2. Consent document versions: texts arrive in I9, links point to placeholders (I1 decided inputs) — SPEC
                  fixes how the version string is set now (constant in `packages/shared`), no default beyond that.
                  3. Supabase Auth project settings (confirm-email off, minimum password length 10, VAL-003) on both
                  projects — a browser step for ORCHESTRATOR before Preview; prod's after Afik's OK.

**Risk flags**    auth: **true** (account creation, session issue) · personal data / **minors: true** (children's names,
                  sex, birth dates now stored) · schema migration: **true** (Child, JourneyContext, LegalConsent) · new
                  external provider: false (Supabase Auth already in use) · unauthenticated endpoint / new surface:
                  **true** (sign-up is reachable by a Guest) · money: false · irreversible: false (additive migration).

**Path**          Elevated.

**Team**          SPEC · DATA ARCHITECT (schema.md, Gate 2: migration + minors' data) · BUILDER · TEST ENGINEER (migration
                  trigger + adversarial) · CRITIC on opus (auth, personal data, unauthenticated surface) · Accessibility and
                  Design consistency domains (new UI). Algorithm & Data: not triggered (no signals, ranking or analytics).
                  User-generated content: names only, no free text beyond them — not flagged.

**Size**          One window expected; if SPEC finds schema + server + UI too large, split into (a) schema + server route,
                  (b) step-2 UI.

**Depends on**    F1.3 merged ✅ · F1.1 schema on preview and prod ✅ · `DATABASE_URL` on Vercel ✅ (14.10).

**Next owner**    SPEC — on everything except item 1; the taken-email criterion stays pending Afik's answer.
