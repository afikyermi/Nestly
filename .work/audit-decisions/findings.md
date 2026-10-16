--- bug ---
severity: medium
file:     .claude/hooks/guard.js:552
claim:    With outsideRoot() removed, CRITIC's kept "never reads notes.md" rule no longer covers a Grep whose path is a UNC alias of the root, or any other path outside the root. Only the outside-root check covered that case, and the [I-1] tests that pinned it were deleted with it.
failure:  CRITIC calls Grep {pattern: ".", path: "\\\\localhost\\c$\\Users\\Afik\\nestly\\.work"} with no glob. relBoth() returns an absolute UNC path for both forms, because path.relative and realpathSync.native keep the UNC form. reaches(r, '.work') and isInside(r, '.work') are both false and isFile is false, so checkReadPath returns null. ripgrep then prints the contents of every .work/<slug>/notes.md. The same happens with a Grep on a sibling checkout such as "C:/Users/Afik/<other-clone>": r = "../<other-clone>" is neither top nor .work. Before this PR, both calls were blocked as OUTSIDE. Read of notes.md is still blocked by basename, so the gap is Grep only. CRITIC has no shell, so Grep is its only remaining route to notes.md.
fix:      In checkReadPath, for Grep: when either relBoth form is absolute or starts with "..", require grepExcludesNotes(input) just as a search that reaches .work does. Restore the deleted '[I-1] critic: UNC alias of the root, Grep on .work with no glob, is blocked' test.
--- end ---

--- bug ---
severity: medium
file:     .claude/hooks/guard.js:394
claim:    The guard now allows `git add` and `git commit` in one command and leaves the scan of that commit to .githooks/pre-commit. It does not block `git commit -n` / `--no-verify`, and it does not check that core.hooksPath is set, so both conditions skip the only scan that sees the staged secret.
failure:  An agent runs `git add apps/server/src/x.ts && git commit -n -m x`, where x.ts holds an sb_secret_ key. The guard scans the index before the add, finds nothing and allows the call. `-n` skips pre-commit, and the secret is committed to the public repo. The same happens without -n in a clone where nobody ran `git config core.hooksPath .githooks`, such as a fresh or cloud clone. The pre-commit header says the hook is "Enabled once per clone", and nothing enforces it. An agent whose commit failed on the budgets step in pre-commit is likely to retry with --no-verify. Before this PR, the add/commit split rule blocked all three cases.
fix:      In checkAll: block `commit` with -n or --no-verify. When add/stage/rm/mv/etc. share a command with a commit, allow it only if `git -C <repo> config core.hooksPath` is `.githooks`; otherwise keep the old "run them as separate commands" block.
--- end ---

--- bug ---
severity: medium
file:     .claude/skills/synthesize/SKILL.md:18
claim:    The synthesize skill still applies the removed verdict model. It rejects and re-runs "a review without a verdict" and points to the deleted workflow.md section "Two reviewers, one outcome". It drafts debt.md lines only for `Validated with Concern`. /wrap-up takes "the debt.md lines from synthesize", still requires "no `Not Ready` stands", and /gate keys on a `Not Ready` verdict.
failure:  CRITIC 1.7 returns a bug list with no verdict line. When ORCHESTRATOR runs synthesize after the reviews (the skill's own trigger), step 1 rejects the review and re-runs CRITIC. That breaks "one review round per part" and spends an extra opus or sonnet review on every part. If a run does get through, a low bug that was not fixed in its part never becomes a debt.md line: synthesize only drafts lines for `Validated with Concern`, and wrap-up writes only synthesize's lines. That contradicts CLAUDE.md's debt.md row ("every low bug not fixed in its part"). .claude/agents/algorithm-data.md:111 also still says "the same verdicts as CRITIC", while workflow.md says it returns a bug list.
fix:      In the same PR, update synthesize (outcome = any open critical/high/medium from either reviewer blocks; a debt.md line per unfixed low bug), the wrap-up precondition, gate step 41 and algorithm-data.md:111 to the bug-list rule in workflow.md "Verdicts".
--- end ---

--- bug ---
severity: low
file:     CLAUDE.md:95
claim:    "You must never" still lists only a `high` or `critical` finding as not ORCHESTRATOR's to dismiss, plus a `Not Ready` that no longer exists. Under the new rules a medium bug also blocks the merge, and line 166 points to this rule for the binding force of severity.
failure:  ORCHESTRATOR, merging on the new pre-approved path (also at night, with Afik reviewing only afterwards), reads CLAUDE.md, which is always loaded. Because medium is not in the list, it treats a medium bug as dismissible and merges with it open. workflow.md step 13 and "Verdicts" forbid exactly that.
fix:      Change the line to: "A critical, high or medium bug from CRITIC (or ALGORITHM & DATA) is not yours to dismiss or re-grade." Drop the `Not Ready` sentence.
--- end ---

--- bug ---
severity: low
file:     .github/workflows/migrate.yml:96
claim:    Production now runs only on workflow_dispatch. Under the shared `concurrency: migrate` group, a pending dispatch is replaced by a later pending push run, and the push run skips production, so the batched production migrate can silently not happen.
failure:  A migrate run is in progress. ORCHESTRATOR dispatches the daily batch (`gh workflow run migrate.yml --ref main`), which waits as pending. Another migration PR then merges, and its push-triggered run takes the single pending slot, cancelling the dispatch. The push run applies preview and skips db-production. Production stays behind until the next dispatch, and ORCHESTRATOR has recorded the batch as dispatched. Before this PR the push run also ran production, so the replacement lost nothing.
fix:      Give the dispatch its own group (for example `group: migrate-${{ github.event_name }}`), so a push cannot replace it while both still serialize on preview. Alternatively, have ORCHESTRATOR confirm the db-production job succeeded on the run it dispatched (`gh run watch`) before recording the batch.
--- end ---
