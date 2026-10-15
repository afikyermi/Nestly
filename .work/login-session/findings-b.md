# Findings — F1.5 part b (CRITIC, opus, 15.10.2026)

**Verdict: Validated with Concern** (cost: F1–F4). No critical or high.

| # | Sev | Where | Claim | Route |
|---|---|---|---|---|
| F1 | medium | access.ts:81, spec c15 | `signed-in-no-account` redirects `/terms`, `/privacy` → consent links dead | ORCHESTRATOR: spec Amendment 1 → BUILDER + TEST ENGINEER |
| F2 | medium | auth-session-source.ts:622-627, 715 | any `/api/me` failure at restore → `loading` forever, 15 s loop, no backoff | ORCHESTRATOR: Amendment 1 → BUILDER + TEST ENGINEER |
| F3 | medium | platform/*, eslint.config.mjs | adapter boundary legitimate but unfenced: no lint block, wiring in services, platform imports services, no convention | BUILDER (fence + conventions proposal), CRITIC validates |
| F4 | medium | tests | no test: refresh in one tab keeps the other signed in; `windowBrowserEvents` filters; non-https URL → not configured | TEST ENGINEER |
| F5 | low | auth-session-source.ts:709; auth-client.ts:407 | logout in tab A can show tab B "expired" | Amendment 1 → BUILDER + TEST ENGINEER |
| F6 | low | e2e harness | criteria 10, 14 E2E need the real session source (stubbed Auth, `/api/me`) | ORCHESTRATOR: into part c |

Checked with no finding: password only to `/token`; storage = tokens only; not-configured guard; fail-closed paths; epoch;
logout wins over refresh (SDK commit guard — the "lock" comment is stale); guard deny-by-default; no secrets, no PD in logs,
no Auth text in DOM, source scan holds; A1, A9.
