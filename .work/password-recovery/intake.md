# intake — F1.6 password-recovery

**Intent**        I1 row F1.6, read through Addendum 1 (`.work/_initiatives/I1-accounts-access.md`): password recovery
                  **inside the product, no email**; SPEC and DATA ARCHITECT design the mechanism; CRITIC on opus; one approved
                  exception to platform rule 1 for this flow only, if needed — isolated, least privilege, rate-limited,
                  audited, listed in data-model.md "Approved exceptions".

**Problem**       A user who forgot their password has no way back in: "שכחתי סיסמה" on `/login` leads to the `/recovery`
                  placeholder (`apps/web/src/app/paths.ts:8`). No email and no phone exist to prove who they are.

**Requirements**  FR-AUTH-003 (`docs/srs/05-functional/auth.md`) · AC-092 (`15-acceptance.md`) · OP-029
                  (`appendix-b-open-points.md`) · VAL-003 (new password) · ERR-001 style non-revealing answers · NFR-SEC-001,
                  NFR-SEC-009 (session) · FR-ADMIN-005 Audit (`admin.md`) · platform rule 1 and "Approved exceptions"
                  (`.claude/knowledge/data-model.md:72, 115`) · F1.5 session source (`.work/login-session/interface.md`).

**Open items**    1. **The mechanism (OP-029)** — how a user without email or phone proves the account is theirs: e.g. a
                     recovery code shown once at sign-up (and to existing accounts on next sign-in), recovery questions, or
                     another factor. → SPEC recommends; a mechanism that changes registration (F1.4) or the security model is
                     a DECISION REQUEST. Afik already accepted the risks of in-product recovery (FR-AUTH-003); choosing among
                     mechanisms inside that is ORCHESTRATOR's, unless SPEC finds it changes the security model.
                  2. **Elevated path for setting a password without a session** — may need the Auth admin API (service_role),
                     i.e. the pre-approved exception. DATA ARCHITECT designs its isolation (Gate 2), CRITIC on opus.
                  3. Accounts created before F1.6 (preview and production) have no recovery factor.

**Risk flags**    authentication: **true** · personal data: **true** · schema migration: **likely** (recovery factor,
                  attempts, audit) · new external provider: false · unauthenticated endpoint: **true** — recovery is used
                  signed-out · money/minors: false.

**Path**          Elevated.

**Team**          SPEC → ORCHESTRATOR Gate 1 → DATA ARCHITECT Gate 2 → BUILDER → local checks → TEST ENGINEER → CRITIC on
                  opus → Preview. Schema migration → DATA ARCHITECT + TEST ENGINEER. New UI → Accessibility, Design domains.

**Next owner**    SPEC
