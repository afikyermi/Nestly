# CRITIC findings — flaky-tests (PR 65), round 1

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write. No critical or high. 3 medium, 3 low.

## Bug list

| # | Sev | File:line | Defect | Scenario | Fix |
|---|---|---|---|---|---|
| 1 | medium | packages/shared/tests/registration-credentials.test.ts:198-202 (password half) | "Not by scanning" no longer proven for the password. The old test failed if the 5 MB password took ≥100 ms; the new assertions (message set = `password_length`, `too_big` present) are identical whether or not the `.refine` (which calls `Array.from` over 5 MB, registration-credentials.ts:44-49, text.ts:14) also runs. | The `.max` check does not abort, so the refine may still scan 5 MB after the raw bound fails; an implementation that scans (or with the raw bound removed) produces the same message set and passes. The old timing likely caught exactly this — the flake may have been a real product inefficiency hidden as a test flake. | Assert the password issue list is exactly `['too_big']` (no second `custom`/refine issue); if the refine does run today, report that to BUILDER as a product finding, don't hide it. |
| 2 | medium | .claude/workflow.md Test rules "Unstable tests", last sentence | "A failure of a listed unstable test" — the list is undefined (no file, owner or entry rule). | Any failing test can be declared known-unstable, and the rule (one rerun, record, continue) turns a real regression into a rerun; "new failure: stop" only works if the list is a concrete artifact. | Name the list (e.g. a debt.md section), who adds entries, and the entry rule. |
| 3 | medium | .claude/workflow.md quarantine clause; test-engineer.md:125 | Quarantine (`skip` tagged `flaky:`, a date) can leave an acceptance criterion with no running test; no approver, no CI-enforced expiry, no criterion ID; "a date" is not an expiry. | TEST ENGINEER quarantines a criterion's only test; it stays skipped and no gate shows the criterion uncovered — contradicts "a test per criterion" in the same list. | Require ORCHESTRATOR/Afik notice, an expiry that fails CI once passed, and the criterion ID in the tag. |
| 4 | low | .claude/workflow.md Test rules (compression) | The compression dropped meaning, not only wording: (a) Browsers lost "A release gate before the deploy is an open question for Afik (WORKPLAN)"; (b) lost "(desktop + phone)" for PR e2e; (c) lost the stabilised-noise list (fonts, animation, clock, data); (d) lost "also not on a low review item"; (e) lost "not a target or a ceiling". | (a) hides an open decision so it won't be re-raised; (d) is a behaviour change — hardening prompted by a low review item is no longer explicitly banned. | Restore (a) and (d); (b), (c), (e) optional. |
| 5 | low | e2e/support/profiles-fixtures.ts:79 | `signIn` now requires `/feed`; by access.ts:41-48 the user lands there only with no `returnTo`, no `mustSetPassword` and no `needsQuestions`. | A future fixture user in one of those states waits 30 s with a message that doesn't say why. All current callers go through `/login` directly, so fine today. | Add a comment naming the precondition. |
| 6 | low | ci.yml `flaky-proof` and the test:db loop (temporary) | The proof is narrower than its claim. | `flaky-proof` repeats only user-profile-actions.spec.ts:386 and user-profile.spec.ts:183 (20× each, Chrome and Edge); the signIn/openProfile edits affect ~40 other tests, which get one run each, so "fixed e2e x20" overstates it. Line selectors are correct for this diff but break if the files shift. The test:db ×5 and recovery-store ×20 steps exercise `recovery-store.db.test.ts`, which isn't in this diff — either the fix is already on main, or the proof covers a fix this PR doesn't contain. `--repeats` is a real vitest option. registration-credentials is deterministic now and not in the loop — fine. | |

## Per-test checks
- toBeFocused (user-profile-actions.spec.ts:403): same criterion (focus on the opener after cancel and Escape); now retries, so focus restored late (≤5 s) passes — acceptable. No finding.
- signIn `/feed` wait and the domcontentloaded gotos: fixture preconditions, not criteria; c27 still asserts its own path and view counts (user-profile.spec.ts:177-180, 190-192).
- openProfile 20 s (profiles-fixtures.ts:152): hides no criterion; NFR-PERF-001 (06-non-functional.md:13) is measured on Preview, not stubbed e2e; a wrong screen still fails at 20 s. No finding.
- registration-credentials, email half: sound — 5 MB spaces would give `email_required` + `custom` under a scan; 5 MB letters would give `custom`/`email_invalid` rather than `too_big`; both fail if the raw bound is removed or stops short-circuiting.

## Decisions and TEST ENGINEER
The decisions index and October entry are not in review.diff (could not verify). test-engineer.md 2.3 matches workflow.md; it omits "listed test: one rerun" (orchestration, not TEST ENGINEER's job). The version bump is within authority only on Afik's 18.10 approval, which CRITIC did not see.

## Done · Artifact · Findings · Open · Next owner
Done: one-round review of PR 65. Findings: #1–#3 medium; #4–#6 low. No confirmed product bug, but #1 may point to one. Open: (a) does the password refine run after the raw-bound failure? (b) where does the "listed unstable tests" list live? (c) why does the proof cover recovery-store when this diff doesn't touch it? Next owner: TEST ENGINEER for #1 (CRITIC re-checks it); ORCHESTRATOR for the workflow.md text in #2–#4.

## ORCHESTRATOR's handling (18.10.2026)
- #1: confirmed empirically — a 5 MB password yields `too_big` **and** `custom`: the refine scans after the raw bound fails.
  A real (low) product bug, web-only (the schema is used by five apps/web forms; the server has its own body limits).
  Per Afik's rule it is reported, not fixed here: debt.md line; the test's password half now says plainly what it does
  not prove. While checking, two more 100 ms wall-clock tests were found in the same file (5 MB names): the names do stop
  at the raw bound (`.pipe`), so both now assert exactly `['too_big']` (20/20 local runs).
- #2, #3: workflow.md — "Listed = a `debt.md` line tagged `flaky:` (test, first failure, owner) after a diagnosis";
  quarantine tag `flaky:<criterion ID>:<expiry ≤ 7 days>`, Afik is told, expired = a blocker at part close (CI-enforced
  expiry is not built: recorded in the audit plan). TEST ENGINEER 2.3 row matches.
- #4: (a) and (d) restored, and (b) "desktop + phone"; (c), (e) left out for the byte budget (meaning unchanged).
- #5: comment added. #6: recovery-store's fixes are on main (PR 59); the proof re-checks them under repetition, which is
  what Afik asked for test:db. The e2e proof is widened to the two whole spec files 5× each (next proof commit).
- Afik's approval of the rules: his message of 18.10.2026, step 11ב.
