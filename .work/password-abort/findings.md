# PR 71 (item 3, password abort) — CRITIC findings, round 1 (returned as text; saved verbatim by ORCHESTRATOR)

## CRITIC findings: password-abort (PR 71)

Verdict: the fix does what it claims. I found no bugs at critical, high or medium severity, and one low-severity scope note. I only read code; I ran no tests.

### Checks you asked for

**1. Does `abort` stop later refinements (zod 4.6.5)?** Yes.
- `node_modules/zod/package.json` is version 4.6.5.
- The `.max()` check in `v4/core/checks.js` (`$ZodCheckMaxLength`, lines 265-287) pushes its issue with `continue: !def.abort`. With `abort: true` that is `continue: false`.
- In `runChecks` (`v4/core/schemas.js`, lines 34-74), `util.aborted(payload, currLen)` sets `isAborted` after that issue, and the next check (the `.refine`) is skipped. The refine has no `when`, so it is subject to the skip (line 47).
- Inside `z.strictObject({ email, password })`, the abort stays within the password field. The object's early exit (lines 842, 1031) only applies when `ctx.abortEarly` is set, and `safeParse` does not set it. The email is still validated, and the 5 MB password test (which uses a valid email) shows no email issue.

**2. Are issue codes and messages unchanged for all other password inputs?** Yes.
- `abort` only has an effect when the raw bound fails, so every input that passes `.max(1024)` goes through exactly the same refine as before.
- Empty, 7 and 8 code points, 128, 256 and 257 code points, 8 emoji (16 units), 256 emoji (512 units), 257 emoji and 4 emoji (8 units) all pass the raw bound, so they are unchanged.
- Exactly 1024 units passes the raw bound and still gets `custom` / `password_length` from the refine. The new boundary test asserts this.
- 1025 or more units now yields only `too_big` / `password_length`. Previously it also yielded a `custom` issue with the same message. Success/failure and the message are unchanged.
- In 4.6.5 the max check counts code points when the unit count exceeds the maximum (`checks.js` line 273). A string of 1025 or more units but 1024 or fewer code points therefore passes the raw bound, and the refine rejects it as before. This is not a regression.

**3. Does anything rely on the old two-issue output?** No.
- The only consumer that reads issues is `apps/web/src/features/registration/step2-form.ts` (lines 44-48). It keeps the first issue per field (`??=`) and maps its message, so a duplicate message makes no difference.
- Other callers use only `.success` or the field shape: `shape.password` in `recovery.ts`, `password-change-form.ts`, `forced-password-form.ts`, `recovery-form.ts` and `step2-form.ts:54`. No server code reads the issue count. The only other hit for `password_length` is a "text must not appear" assertion in `register-step2.test.tsx`.
- Each `shape.password` consumer carries over the abort behaviour. They only read `.success`, so nothing changes for them.

**4. Tests.**
- The updated 5 MB assertions (`['too_big']` and `['password_length']`) trace to VAL-003 and the debt/audit A6 intent (the length verdict, with no scan after the raw bound fails), not to a source constant.
- The new boundary test at `RAW_PASSWORD_MAX_UNITS` protects the case where abort would wrongly widen.
- The `debt.md` line removal matches the fix.

### Findings

1. **low — the diff contains work from another change.** `review.diff` also includes `tools/db-local.mjs`, `tools/db-local.test.mjs`, the `package.json` `test:tools` edit and README changes. These are the local-DB tool, which a commit message ("PR 70" is cited in the code) says belongs to a different PR. Failure scenario: if the branch really carries them, the PR 71 review and merge cover an unreviewed scope. If the diff was cut against a stale `main`, this is only noise. I did not review those files, because they are outside the stated scope. ORCHESTRATOR should confirm the branch contains only the three stated files (the `.ts` source, the test and `debt.md`); the `debt.md` change did not appear in the diff I received, so check that too.

2. **info, not a finding.** The comment "not by scanning" is still not literally true. zod's own `.max()` counts code points once the unit count exceeds the bound (`checks.js` line 273). That is O(n) inside zod, but it is not the custom refine. The test asserts the verdict only, which is honest.

**Done:** zod abort semantics, code/message parity and caller reliance verified; no blocking bugs.
**Artifact:** packages/shared/src/validation/registration-credentials.ts (line 43); packages/shared/tests/registration-credentials.test.ts (lines 167-190); .work/password-abort/review.diff
**Findings:** 0 critical, 0 high, 0 medium, 1 low (scope in the diff).
**Open:** confirm the PR 71 branch contains only the three intended files, and check the `debt.md` removal.
**Next owner:** ORCHESTRATOR (save as `.work/password-abort/findings.md`, then proceed to merge once the scope check is clean).

## ORCHESTRATOR (18.10.2026)
- Low 1: GitHub's file list for PR 71 is exactly debt.md, registration-credentials.ts and its test (`gh pr view 71 --json files`);
  the review diff was cut against a stale local main (PR 70 had just merged). No other scope.
- Info 2: noted — zod's own bound counts code points once units exceed it; the custom refine no longer runs.
