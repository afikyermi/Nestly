# intake — I2 F2.0 account-takeover-close (S-01 + S-16)

**Intent**        Afik, 16.10: "תתחיל את I2 לפי WORKPLAN והכללים החדשים (workflow 1.16). החלק הראשון הוא S-01 ו-S-16."
                  Plan: `.work/_initiatives/I2-profile-privacy-friends.md` F2.0. Decided: `I2-questions.md` answers 3–4
                  (`decisions/2026-10.md` 2026-10-16 "I2 questionnaire").

**Problem**       (S-01) Someone who registers another person's email with a password keeps access after the real owner
                  signs in with Google — Supabase links the identities automatically. (S-16) Whoever holds a live session
                  can change the password without any proof and lock the owner out.

**Requirements**  FR-AUTH-005 (`docs/srs/05-functional/auth.md:61`) · FR-AUTH-003 storage, change and reset rules
                  (`auth.md:33–44`; VAL-045, ERR-042–044, NFR-SEC-010) · FR-AUTH-002 (`auth.md:25–29`) · AC-087, AC-088 ·
                  `security-privacy-open.md` S-01 (:20), S-16 (:34) · F1.6 Gate 2 approved exception (`app_recovery`,
                  admin set-password + global sign-out) in `.claude/knowledge/data-model.md`.

**Decided rule**  S-01: on the first Google sign-in into an account that already has a password identity (detected from
                  `auth.identities`, never `app_metadata.providers` — F1.8 as-built correction), the old password is
                  cancelled, every other session is signed out, and the user sets a new password before continuing.
                  S-16: a password change requires answering two of the user's security questions, then the new password
                  — Google users included. No email change in I2.

**ORCHESTRATOR decisions (unreserved, follow from Afik's rule)**
                  D1. S-01 also clears the security-question answers stored before the Google link, and the user stores a
                      new pair (the existing PG-052 hold) — otherwise the earlier registrant regains the account through
                      FR-AUTH-003 recovery, and Afik's rule ("מי שרשם מראש מאבד את הגישה") would not hold.
                  D2. Every password set or change goes through the server (admin set-password, as in F1.6); the client
                      never calls Auth to set a password. Closing S-16 for real then needs the Supabase settings
                      "Require current password when updating" and "Secure password change" turned on — a dashboard step
                      for Afik (see Open items).
                  D3. Profile data the earlier registrant entered (journeys, children) stays; the owner edits it in F2.1/F2.2.
                      Recorded as a residual in `security-privacy-open.md` S-01 at close.

**Open items**    1. Supabase dashboard, both projects (nestly-preview, nestly-prod): turn on the two password settings in
                     D2, after this part merges. Afik's single list; not blocking SPEC or BUILDER. SPEC states whether the
                     F1.8 first-password step keeps working with them on (it must move to the server under D2).
                  No reserved item open.

**Risk flags**    authentication/authorization: **true** — identity linking, password change, session revocation ·
                  personal data: **true** — security-question answers · schema migration: **likely** — a per-account
                  marker that the S-01 takeover clear ran, or a pending "must set password" state; DATA ARCHITECT decides ·
                  irreversible: **true** for the user's data — cancelling a password and clearing answers · money: false ·
                  new external provider: false · unauthenticated endpoint: false (all calls carry a session).

**Path**          Elevated.

**Team**          SPEC (opus) → ORCHESTRATOR Gate 1 → DATA ARCHITECT (opus; Gate 2 on any schema or policy change) →
                  BUILDER (opus) ∥ TEST ENGINEER (from the spec, incl. an `e2e-preview/*.flow.ts` if the flow is visible)
                  → CRITIC on opus (auth, personal data) → E. New UI (password-change screen, forced new-password screen)
                  → Accessibility and Design consistency domains.

**Size**          One spec; SPEC may split (a: server + schema, Elevated · b: screens). One review round per part.

**Next owner**    SPEC
