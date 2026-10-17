# P6 schema-first: CRITIC re-check 2 of finding 2 and N1 (fix commit 970f418)

Saved by ORCHESTRATOR from CRITIC's hand-back (its own Write was refused); text as returned.

Scope: only finding 2 (medium, the PR judges itself) and N1 (low). notes.md not read.

## Finding 2 (medium): NOT FIXED as shipped — the code closes the vector; the process does not guarantee the code that closes it runs
What the code closes (when part-status.mjs and schema-gate.mjs come from main): the same-PR `|| true` vector — part-status.mjs:55-59 blocks when a GATE_FILES path and a PRODUCT path change in one PR, both lists imported from the checkout part-status runs from, not from the PR; the step's other PR-controlled inputs cannot turn a failing gate green; a second workflow posting a green `schema-gate` does not help (the real ci.yml run must also conclude success, :180-182). Renames: `filename` and `previous_filename` both read (:208), tested. Pagination: `all()` stops at 10×100 and records "Pagination limit reached" in errors (:159) — a ≥1000-file PR is a fail-closed false block, not a bypass. Unreadable file list: `safe()` returns [] and records the error; a non-array records "Invalid response"; errors are blockers — fail-closed.
What remains open: workflow.md:128 says `node tools/part-status.mjs <PR>` and each session works in its own branch worktree; run there, part-status takes its rule and GATE_FILES/PRODUCT from the PR (part-status.mjs is not in GATE_FILES). Scenario: one PR changes product code, adds `|| true` to the step, and deletes the blocker in part-status.mjs (or drops ci.yml from GATE_FILES); CI green; ORCHESTRATOR runs part-status in the session worktree; the PR's copy reports no blocker; merge; production serves code without its schema. Fix direction: make the precondition hold by mechanism — e.g. part-status reads its own file and schema-gate.mjs from main through the API and blocks when the local copies differ; at minimum workflow.md:128 states it runs from an up-to-date main checkout (prose is the weaker guard).

## N1 (low): FIXED
schema-gate.test.mjs:151-160 copies the gate alone into a mkdtemp directory, imports and runs `main()`; any static relative import now fails with ERR_MODULE_NOT_FOUND. A dynamic `import()` on a path records-only input does not reach would still slip through — residual, not material. Recovery documented at ci.yml:246-248.

## New problem
N3 (low): tools/part-status.mjs:205-208 — the PR's file list is read after `headAfter`, so a push in between can pair H1's green checks with H2's file list (H2 dropped the ci.yml change) and show no blocker. Window of seconds; low. Fix: read the files before `headAfter`/`mainAfter`.

## Done · Artifact · Findings · Open · Next owner
#2 not fixed as shipped (medium; precondition neither written nor enforced: workflow.md:128, part-status.mjs:3). N1 fixed. New: N3 low. Open: mechanism vs prose is BUILDER's choice; branch protection is Afik's question. Next owner: BUILDER for #2 (and N3); CRITIC re-checks #2.
