# findings — app-shell-guard (I1 F1.2), CRITIC (opus), 14.10.2026, local review

verdict: Validated with Concern

concern (debt.md): source-scan tests that read app source at run time set a precedent against the reader fence (criteria 11, 26 asked for them); Node 22.18 is below react-router's engine (>=22.22).

1 (low) apps/web/tests/app/source-scans.test.ts — reads src with fs and prints matching line text; the c27 hex scan was not asked for. Fix: report file:line only, drop the hex scan; record the c11/c26 exception. → TEST ENGINEER, before the push; exception recorded in decisions.
2 (low) e2e/app-helpers.ts:10-54 — ensureAppServer is superseded by the playwright.config.ts webServer; dead code that can leave a detached server and test a stale bundle. Fix: remove. → TEST ENGINEER.
3 (low) apps/web/package.json react-router ^8.4.0 (engines node >=22.22.0) vs .nvmrc 22.18. Fix: raise .nvmrc and engines to >=22.22. → BUILDER; decision recorded.
4 (low) criterion 6 "a route added in a test, not on the list, is protected" untested (every unlisted test path has no Route). Fix: one test with an extra Route not on either list. → TEST ENGINEER.

Open (QUESTION): npm audit not run by CRITIC → ORCHESTRATOR ran `npm audit --omit=dev`: 0 vulnerabilities. react-router 8.4.0 adds two MIT packages (@remix-run/route-pattern, cookie-es).

Checked, no finding: production bundle uses the always-signed-out source; decideAccess before children render; Navigate replaces; loading skeleton, no shell; odd/encoded/case paths fall to deny; the e2e session source only in a dead MODE==='e2e' branch, marker grep with positive control; no redirect loops; unknown state = signed-out; signOut never rejects; DR-1 applied; wave 1 contracts additive (AppShell imports no router/auth); focus to main after every move; Escape returns focus to the Hamburger; one h1 per screen; titles; axe at 375 and 1024; no physical utilities; no slash forms; one primary on Welcome; nav current not pastel-only; no spinner, borders, counters, dark variants, duplicates; tests fail on the listed broken variants (except 4); no secret, VITE_ variable, dangerouslySetInnerHTML or external request.
