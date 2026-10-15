# intake — F1.5 login-session

**Intent**        WORKPLAN "להמשך" 0 and I1 row F1.5: email sign-in · an error that reveals nothing · logout · session
                  refresh · suspended and banned accounts stopped at once. Plus the debt that closes here: an Auth user
                  with no nestly rows (F1.4 DR-2, spec Q2/Q8, CRITIC b-3) is routed to complete registration.

**Problem**       A registered user who leaves cannot come back: `/login` is a placeholder (`apps/web/src/app/AppRoutes.tsx:20`),
                  there is no logout, and a session does not survive token expiry. A sign-up whose profile write failed
                  leaves an email that can neither sign in nor register again.

**Requirements**  FR-AUTH-002 (`docs/srs/05-functional/auth.md`) · AC-004, AC-091 (`15-acceptance.md`) · ERR-001
                  (`10-errors-edge-cases.md`) · FR-MENU-001 Logout (`05-functional/navigation.md`) · FR-AUTH-004 guest
                  limits · §12 Authentication row (browser ↔ Supabase Auth through one module, publishable key; the server
                  verifies the JWT and reads type and status from the database) · platform rule 15 (`is_active_account`)
                  · VAL-002/VAL-003 for the form · I1 Addendum 1 (`.work/_initiatives/I1-accounts-access.md`).
                  Not here: Google (F1.8), password recovery (F1.6; the "שכחתי סיסמה" link exists and stays a link).

**Open items**    1. No ERR or copy for a **suspended or banned account at sign-in** — the SRS says only that enforcement
                     exists (FR-MOD-002); suspension lengths are an I4 open point. → SPEC proposes a minimal, non-revealing
                     behaviour and copy as a DECISION REQUEST for Gate 1 (ORCHESTRATOR decides; not reserved — no legal or
                     minors content). Not a blocker for SPEC.
                  2. The **orphan Auth user** path: the debt line says "login routes such a user to completing registration".
                     SPEC defines it against F1.4's spec (`.work/register-account-create/spec.md`, DR-2, Q2, Q8).
                  No reserved item.

**Risk flags**    authentication/authorization: **true** — sign-in, session, status gate ·
                  personal data: **true** — email, the users row read at sign-in ·
                  schema migration: **likely** — a suspended user reading their own status may widen `users_select_own`
                  (`supabase/migrations/20261014100000_identity_schema.sql:79`); the D1 test (PR 27) pins
                  `is_active_account()` for exactly this · money: false · new external provider: false (Supabase Auth exists) ·
                  unauthenticated endpoint / new external surface: **possible** — a sign-in that goes through the browser
                  module adds none; any server route reachable before sign-in would be one.

**Path**          Elevated — authentication, personal data, likely a policy migration.

**Team**          SPEC → ORCHESTRATOR Gate 1 → DATA ARCHITECT (Gate 2, if any policy or schema changes; schema migration
                  → DATA ARCHITECT + TEST ENGINEER) → BUILDER → local checks → TEST ENGINEER → CRITIC on opus (auth,
                  personal data) → Preview. New UI (the login screen, logout in the menu) → Accessibility and Design
                  consistency domains (`.claude/workflow.md`). Test rules: a type per criterion, one layer per behaviour,
                  Chrome on PR.

**Size**          Probably fits one spec; SPEC may split into parts like F1.4 (a: policy/server, b: screen) if over ~150 lines.

**Next owner**    SPEC
