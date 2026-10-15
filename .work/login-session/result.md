# Result — F1.5 login-session

**Merged:** PR 29, squash `27816b4`, 15.10.2026. CI on the last commit (`debb91a`): 12 pass, 2 skipped (browser-edge — main
only; preview-smoke). Migration `20261015100000` applied to nestly-preview (migrate run #4, by Afik); production waits for
Afik's approval on `db-production`.

| | Planned | Actual |
|---|---|---|
| Parts | a · b · c, ~1,000 lines | a · b · c; product ≈ 1,100 lines, tests ≈ 2,300 (over the soft ×2 ceiling — 🔴 depth on session states) |
| Gates | Gate 1 (DR-1/2/3), Gate 2 (one policy) | as planned; spec Amendment 1 after CRITIC part b |
| CRITIC (opus) | one review per part | a: Validated with Concern (debt) · b: with Concern → Validated after 6 fixes · c: with Concern → Validated, 1 low to debt |
| Pushes | 3 | 4 (a, a-fixes, b, c) |
| Preview | ORCHESTRATOR signs in | ORCHESTRATOR: login screen at 375/1024 (no credentials outside localhost); Afik: register, reload, logout, Back, sign-in, wrong password, Auth settings (JWT 3600, rotation on) — "1–6 עבר" |

**Quality:** findings fixed in-loop: 401 log could carry claims (a-2); dead consent links in completion (b-F1); unbounded
restore loop (b-F2); unfenced `platform/` (b-F3, convention promoted); late 201 resurrecting a session (c-1). Debt: "own
users row ≠ active" (a concern); one untested reset (c-4). Knowledge promoted: data-model (status gate), data-model-tables
(users authorization), conventions (browser adapters).

**SRS IDs:** implemented FR-AUTH-002, FR-AUTH-004, FR-MENU-001 (Logout), AC-004, AC-091, ERR-001; changed in SRS 2.16:
FR-AUTH-002, FR-REG-004, ERR-036 (cancelled), ERR-037, ERR-038, NFR-SEC-009, AC-099–101. Closes F1.4's orphan-user debt.
