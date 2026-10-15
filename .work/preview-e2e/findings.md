# CRITIC (opus) — E at 44278e4

Saved by ORCHESTRATOR from the hand-back; the agent's file write was refused. CRITIC's text is summarized, and nothing is added.

**verdict: Validated with Concern.** No critical or high finding: 1 medium, 3 low. The carried cost is finding 1: until it is
fixed, a green run does not prove the success texts of F1.6 c16 and c18.

1. **medium.** `e2e-preview/password-recovery.flow.ts:115, :198, :228`. The `confirmation` locator (any role=status with
   text) matches the sr-only busy live region ("שומרים" / "שולחים") in RecoveryQuestionsForm.tsx:146 and
   RecoveryForm.tsx:163. So the success checks of c6.4 (F1.6 c18) and c6.5 (F1.6 c16) pass while the request is still in
   flight. `alert toHaveCount(0)` passes at once too, because submit clears the alert. A missing success screen goes
   unnoticed, and the next test races the aborted request. Fix: assert success only after the request settles (the
   response is 200, or busy ends), with exactly one non-empty status that is not the busy region. Expected values come
   from the spec.
2. **low.** `e2e-preview/support/fixtures.ts:350-357` (c11). Flow-module code that runs at import, and the runner
   process, can still read VERCEL_AUTOMATION_BYPASS_SECRET. The secret is deleted from `process.env` only when the
   worker fixture first runs, and no test covers this. Fix: read the secret and delete it before any worker starts
   (globalSetup or config closure), and test that. Or record a change to c11.
3. **low.** `tools/preview-e2e.test.mjs:797, :849-850, :686-689, :759-761`. Some expected values come from the source, and
   some checks scan source text. The header names are imported from bypass.ts, though spec c4 names them as literals.
   Two checks grep source text, which the pace decision of 14.10 bans. Fix: use the spec's literal header names, drop the
   source scan at 759-761, and assert c12 by loading the root config instead of grepping it.
4. **low.** `.github/workflows/preview-e2e.yml:64-72` (c10). The summary does not list passed and failed per viewport, and
   no test asserts that the final step is `if: always()`. Fix: write the outcome per project to the step summary (from
   a JSON reporter, with no user data) and add the YAML assertion. Or record a change to c10.

**Concerns (debt):**
- `concurrency: preview-e2e` is one group across all branches. GitHub keeps one pending run per group, so an older
  pending sha gets "cancelled" and no result. Change to a per-sha group once DR-E1 settles the sweep.
- Actions trust boundary: the workflow and the code both come from the deployed sha. The real boundary is Vercel Git
  Fork Protection, and `environment: preview-e2e` adds nothing while the bypass secret is a repository secret. This is
  the residual accepted on 14.10. The diff adds nothing new.

**Checked, no finding:** script injection · URL guard · bypass confined to the deployment origin · secrets kept out of
argv, URLs and reports · the anchored email pattern · the F1.6 walk, except finding 1 · the failed-attempt budget (2 per
user, 4 per IP per run) · the 2× ceiling (1.0× if the flow counts as product, about 2.0× if it counts as test;
result.md records which reading applies).

## Re-check (CRITIC opus, fresh run, 639123d vs 44278e4)

verdict: Validated with Concern. Findings 2, 3 and 4 are closed. Finding 1 is mostly closed. A residual is downgraded to low: after
`waitForResponse`, the status count can still poll the busy region before React commits (flow:107, :137). Fix: wait for the
submit's busy state to end, then count. New 3a (low): the c11 tests import `SECRET_ENV` from the code under test
(tools/preview-e2e.test.mjs:282). Fix: use the spec's literal name. Concern: the bypass file path reaches workers via
`PREVIEW_E2E_BYPASS_FILE`, so c11 is a fence, not a wall. The DR-E1 credentials must never use this pattern; they belong
in the cleanup step only. Round limit reached (one fix round, one re-check): the residuals go to debt.md.
