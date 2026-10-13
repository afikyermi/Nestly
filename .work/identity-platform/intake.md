# intake — identity-platform (I1, F1.1)

**Intent**        Afik, 13.10.2026: "המשך: I1 … אחר כך I1 לפי המסלול. שער ה-RLS ב-CI נכנס עם המיגרציה הראשונה. עצור לפני
                  Gate 1 ושלח לי את spec.md." First feature of I1 per `.work/_initiatives/I1-accounts-access.md` → F1.1.

**Problem**       No request can carry a user's identity to the database yet: the server verifies no token, no product table
                  exists, and nothing enforces RLS — so no I1 screen (shell, registration, login) can be built on it.

**Requirements**  (SRS; read the lines, not the files)
- NFR-SEC-001, 002, 006(4) — `docs/srs/06-non-functional.md` lines 9, 10, 40
- AC-078 (the non-guessable-identifier part only) — `docs/srs/15-acceptance.md` line 84
- Entities User, RegularProfile — `docs/srs/13-data.md` lines 16–17, relations §13.1
- FR-AUTH-004 / AC-016 (a Guest reaches nothing) — the server side only; the UI guard is F1.2
- Platform rules 1–16 and authorization layers 1, 2, 13 — `.claude/knowledge/data-model.md`
- Carried in from WORKPLAN "פתוח מחלקים שנסגרו": **7.1 RLS gate in CI** (RLS + FORCE RLS on every table, no table owned
  by `app_server`, every view `security_invoker`, a pgTAP test that a query without identity fails, tests run as
  `app_server`) · **7.3** migration workflow, `app_owner` connection strings (Afik enters), prod bootstrap (Afik runs),
  one pooler connection per function instance · **7.0** importing `@nestly/shared` from the Vercel function · **7.4**
  Preview per branch.
- Decided inputs: JWT via `jose` + `createRemoteJWKSet` (decisions 2026-10-11 "JWT verification").

**Open items**
- Schema conventions (identifier type, timestamps, naming, enums, helper organisation) — "to be decided with the first
  table" (`data-model.md`). DATA ARCHITECT proposes at Gate 2; ORCHESTRATOR approves (not reserved).
- The anchor's ON DELETE action, against retention §13.4 (TBD) — reserved for Afik **if** it touches data about minors.
  F1.1 has no Child table, so SPEC must not decide it; DATA ARCHITECT raises it at Gate 2 if it applies.
- Retention periods §13.4 — TBD; F1.1 must not set any.
- `DATABASE_URL` for `app_server` on Vercel — a secret Afik enters (WORKPLAN "ממתין לך" 3). Not blocking SPEC.

**Risk flags**
- authentication / authorization: **true** — JWT verification, identity transaction, RLS
- personal data / minors / health / media: **true** — User and RegularProfile hold personal data (no minors in F1.1)
- schema migration / irreversible: **true** — the first migration; the anchor FK via bootstrap
- money: false
- new external provider: false — Supabase Auth and its JWKS are already decided and in use
- unauthenticated endpoint / new external surface: false unless SPEC adds one — `/api/health` exists already

**Path**          Elevated — three flags.

**Team**          SPEC (opus, flags) · DATA ARCHITECT (opus; schema migration → + TEST ENGINEER) · BUILDER (opus) ·
                  TEST ENGINEER · CRITIC on opus (auth, personal data). No UI → Accessibility and Design domains do not
                  fire. No signals/ranking/events → no ALGORITHM & DATA.

**Size**          Likely two windows (the initiative already says so): auth middleware + identity transaction, and the
                  identity schema + RLS gate. SPEC decides; a split is two spec parts on one Gate 1.

**Gate 1**        For I1, Afik reads `spec.md` before ORCHESTRATOR passes Gate 1 (decision 2026-10-13).

**Next owner**    SPEC
