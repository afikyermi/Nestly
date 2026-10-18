# P6 schema-first: CRITIC re-check of findings 1 and 2 (fix commit 03689bd)

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write.

Scope: only round-1 findings 1 and 2. notes.md not read. Files read: tools/schema-gate.mjs, tools/schema-gate.test.mjs, .github/workflows/ci.yml (job `schema-gate`, :241-273), tools/part-status.mjs (CI_NAMES and evaluate), tools/part-status.test.mjs, findings.md.

## Finding 1 (medium), quoted git paths hide a migration: FIXED
- `ls-tree -r -z` and `diff -z --name-status --no-renames` are used for the base, the head and the evidence tree (schema-gate.mjs:133-135, :148). Records are split on NUL; a record that cannot be parsed throws, and `main` turns the throw into exit 1 (:24-42, :136-139).
- Any path under supabase/migrations that is not `<name>.sql`, including a file in a subdirectory, is a problem (:59-61). The current tree holds only `.sql` files, so no false block.
- Tests: a Hebrew file name is parsed and visible (test:27-34); an end-to-end "split it" case uses a Hebrew name (:53-54); quoted or garbage input throws (:31, :33); a stray file under migrations fails (:75).
- No new defect.

## Finding 2 (medium), the PR judges itself: NOT FIXED (one vector remains, same severity: medium)
What the fix closes:
- The `tools/schema-gate.mjs` vector: CI runs the base commit's copy (ci.yml:267-268). Relaxing `PRODUCT` or short-circuiting `evaluate` in the PR has no effect.
- Removing the job or adding `if: false`: `schema-gate` is in part-status CI_NAMES (part-status.mjs:9). A missing check gives `Required schema-gate: missing`, and a skipped one is a blocker unless ORCHESTRATOR passes `--expected-skip` (:53-62).

What remains open: the job's run line still comes from the PR's own ci.yml, and the new "product code + gate files → split it" rule is enforced only inside that run line.
- Where: .github/workflows/ci.yml:264-273 (the step script is read from the PR's merge tree) and tools/schema-gate.mjs:67-70 (the split rule is checked by a process whose exit code the PR's step decides how to use).
- Failure scenario: (1) one PR changes apps/server/src to use a migration not yet applied in production; (2) the same PR edits the step to `node "${gate}" || true`, or replaces the `git show 'HEAD^1:…'` branch with `cp tools/schema-gate.mjs` and relaxes that copy; (3) the base copy runs and logs `::error::… split it` and `not applied in production`, but the step exits 0, so `schema-gate` reports success; (4) part-status sees a present, successful check; (5) the wiring test (schema-gate.test.mjs:161-163) only matches substrings, so it still passes with `|| true` appended, and it could be edited in the same PR anyway; (6) ORCHESTRATOR merges on green, and production serves code without its schema. This is the round-1 defect itself. The error annotation is still in the log, but nobody reads it when the check is green.
- Fix direction (not prescribed): enforce the "product + gate files" rule where the PR does not control it. Either part-status (run from ORCHESTRATOR's main checkout) reads the PR's file list through the API and blocks when product paths and GATE_FILES change together, or the gate runs in a workflow whose definition comes from the base (e.g. `pull_request_target`, which runs the base copy and never executes PR code).

The four points asked:
- Bootstrap branch: correct. The PR's own copy runs only when `git cat-file -e HEAD^1:tools/schema-gate.mjs` fails. After P6 merges every base has the file, and a PR cannot change HEAD^1. The fallback would also trigger if HEAD^1 were absent, but `fetch-depth` is set in the PR's ci.yml too, so that is the same vector, not a separate one.
- Self-judging through two PRs: PR 1 changes only the ci.yml run line (e.g. `|| true`); the base gate passes it (no product code) and its schema-gate check is present and green. PR 2 then changes product code under the weakened job. This is the designed "gate change first" route and depends on review of a ci.yml-only diff, which can be seen and reviewed on its own; no separate finding. The same-PR path above is the defect, because nothing there forces a separate, visible gate change.
- Import-free requirement: holds for the current file (only `node:` imports), so the copy in RUNNER_TEMP runs. The test that enforces it is narrow; see N1.
- False blocks from "product code + ci.yml → split it": not material. Feature PRs rarely touch ci.yml; a split costs one ci.yml-only PR; the changes filter runs every job for a ci.yml change, so that PR is still fully tested. Matching the whole ci.yml file is coarse but acceptable. No finding.

## New defect introduced by the fix
### N1. low: a broken gate merged to main reds every later PR, including the one that fixes it
- Where: ci.yml:267-268 (every PR runs the base copy) and schema-gate.test.mjs:148-151 (the import-free check matches only `^import … from '…';$`: single quotes, one line, static).
- Failure scenario: a gate-only PR adds `import { parseYaml } from "./workflow-yaml.mjs"` (double quotes), a multi-line import or a dynamic `import()`; the regex misses it and the in-tree tests pass; the old base copy judges that PR, so it goes green and merges; from then on every PR's schema-gate fails with ERR_MODULE_NOT_FOUND (exit 1), including the PR that removes the import, because the broken base copy judges it too; the only way out is a merge that is not green. Fails closed (nothing unsafe merges), but every PR stays blocked until someone overrides it; any other crash merged into the gate locks the project the same way.
- Fix direction: test what CI actually does — copy the file to a temporary directory, then import or run it there with injected git — and document the recovery path for a broken base gate. Falling back to the PR's copy, as the bootstrap branch does, is not acceptable recovery (it reopens finding 2).

## Done · Artifact · Findings · Open · Next owner
- Done: re-checked findings 1 and 2 against 03689bd. Artifact: this file (CRITIC's Write was refused).
- Findings: #1 fixed. #2 not fixed, still medium (ci.yml:264-273 with schema-gate.mjs:67-70). New: N1 low.
- Open: branch protection is off, so part-status is the only enforcement until a required check exists. The two-PR path relies on review of ci.yml-only diffs; whether that is acceptable is a process question for ORCHESTRATOR and Afik, not a finding.
- Next owner: BUILDER for #2 (and N1 if scheduled); CRITIC re-checks #2.
