# notes — google-sign-in

## P1 — guard: TEST ENGINEER may write e2e-preview/*.flow.ts (criteria 1, 2)

**Approach**        `.claude/hooks/guard.js`: new `PREVIEW_FLOW = /^e2e-preview\/[^/]+\.flow\.ts$/`, added to `testEngineerMayWrite` only. The error text for a refused write now lists `e2e-preview/*.flow.ts`.
**Decisions**       Not added to `TEST_AREAS`/`isTestPath`: that is shared with BUILDER's "does not write tests" rule and the Bash-shell test-path rule, so adding it there would change BUILDER. Existing checks in `testEngineerMayWrite` still run first (app source, notes.md, tool configs such as `playwright.flow.ts`).
**Deviations**      none
**Deliberately not done**   TEST ENGINEER Bash allowlist unchanged (still only *.test.*/*.spec.* files); BUILDER behaviour for `e2e-preview/` unchanged; guard.test.js not touched (TEST ENGINEER).
**Uncertain**       I could not run the guard tests: the auto-mode classifier denied `node --test .claude/hooks/guard.test.js` as self-modification. `node --test .claude/hooks/` (directory form) fails on this Node with "test failed" and no tests found, so it proves nothing. ESLint ignores `.claude/` (file ignored by pattern), so no lint result. ORCHESTRATOR or TEST ENGINEER must run the guard tests.
**Wiring**          `.claude/hooks/guard-flow.test.js` added to `test:tools` in root `package.json`, right after `guard-loader.test.js`; not run locally (CI runs it).
**Preview path**    none (tooling only)
**Neighbouring**    none
