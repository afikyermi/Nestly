# P6 schema-first: CRITIC re-check 3 of finding 2 and N3 (fix commit 78df35f)

Saved by ORCHESTRATOR from CRITIC's hand-back (its own Write was refused); text as returned, condensed only in layout.

## Finding 2 (medium): FIXED
tools/part-status.mjs:217-225 compares the local tools/part-status.mjs and tools/schema-gate.mjs (read relative to the running script, :147-148) with the copy at the PR base via `contents/<file>?ref=<base sha>`; a difference, an unreadable local copy, or a response with no `content` each push an error, and errors are blockers (:50). Run from a PR worktree whose copy differs from the base, it refuses to judge — the original scenario is caught. The PR cannot influence the target through its content (`base.sha` is on the base branch); see N4 for retargeting. Bootstrap: base without schema-gate.mjs → 404 → error → blocks; fail-closed; acceptable for the hand-merged bootstrap PR. CRLF: both sides normalised (:222); a BOM or lone `\r` would false-block (fail-closed), not material. Test (part-status.test.mjs:239-248) covers identical copies, an edited gate and unreadable local copies; the fixture's base has no `sha`, so the `base.sha` branch and the requested ref are not asserted — a coverage gap, not a defect. Residual (not a finding): a check cannot verify the program it runs in; a PR deleting the self-check together with the blocker, run from its own worktree, reports nothing — requires deliberate subversion of a file whose diff CRITIC reviews. Optional: one workflow.md:128 line "run from an up-to-date main checkout".

## N3 (low): FIXED
The file list is read at :214, before `headAfter` (:226): a push between `head` and the file read makes `headAfter` differ and "Head changed" blocks; a push after it leaves files and checks both from H1, and the run blocks anyway.

## New problem — N4 (low): tools/part-status.mjs:218 (target), :171 (base ref never required to be main)
Stale base: `pull.base.sha` can lag current main; if main changed part-status.mjs or schema-gate.mjs after the PR's last push, a run from an up-to-date main checkout false-blocks with misleading advice (rare, fail-closed, remedied by updating the PR). Retarget: the target follows the PR's `base.ref`; a PR retargeted to a non-main branch carrying edited copies passes the self-check from that worktree — merging into a non-main branch does not deploy, negligible impact. Fix direction: compare against the `main` SHA collect already reads (:172), optionally block `pull.base.ref !== 'main'`.

## Done · Artifact · Findings · Open · Next owner
#2 fixed; N3 fixed; new N4 low. Open: N4 fix now or debt (ORCHESTRATOR); the workflow.md:128 prose line optional. Next owner: ORCHESTRATOR.

## ORCHESTRATOR (18.10.2026)
N4 fixed: the self-check compares with current main's copies (`contents/<file>?ref=<main sha>`), asserted in the test. The
workflow.md:128 line is left for the post-P2 pass (P2's file, byte budget at 36,982 / 37,000).
