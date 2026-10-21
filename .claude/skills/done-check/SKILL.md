---
name: done-check
description: Checks an initiative's (or completion's) code PR against its brief before merge — every FR/BR/AC/VAL/ERR/PG line has code, a test that asserts it with the AC ID, and the main flow has an e2e-preview flow; the SRS matches decisions-in-force, has no HOW text, and the status rows are updated. Outputs a short table of what is missing. Run in a separate subagent before merging an initiative's code PR.
argument-hint: <initiative, e.g. I13> <PR number or branch>
---

# done-check — nothing merges with a hole in it

**Version:** 1.1 · the rule is in `CLAUDE.md` → "Work". Runs in its own subagent, read-only, before the merge of an
initiative's (or a completion's) code PR.

## Input

`$ARGUMENTS` — the initiative and the PR (number or branch). The brief is `.work/briefs/<initiative>.md` (written by
`srs-lookup` → "Brief"). No brief → write it first (srs-lookup "Brief"), then check.

## Steps

1. **Read the brief** and the PR diff (`gh pr diff <n>` or `git diff origin/main...<branch>`).
2. **Per brief line** (FR, BR, AC, VAL, ERR, PG): find
   - **Code** — the file:line that does it (server, web, DB).
   - **Test** — a test that asserts it: pgTAP for permissions, a server test for rules, a web/Playwright test for a
     screen. The test's title or a comment names the ID (`AC-123`, `BR-045`…). A test that only runs the code
     without asserting the rule does not count.
   - A line marked "later" in the brief with Afik's reason is skipped (it must already be in WORKPLAN).
3. **Main flow on a real Preview.** The brief's main flow has an `e2e-preview/*.flow.ts`, written per
   `e2e-preview/README.md`: the action AND the result checked from another user's side (or the staff's). A flow
   against stubs only does not count.
4. **Fixed rules from the brief (c):** staff principles (decisions §9–§10), retention (§13.4: who deletes, when it
   runs — a purge nobody calls is missing), Audit for every staff action that the SRS audits, children's data, the
   strict-query trap (#147: a route that validates its query strictly accepts Vercel's `path` parameter).
5. **SRS:**
   - Every decision in `decisions-in-force.md` that this initiative touches is written in the SRS, and its line
     left decisions-in-force in the same PR.
   - No HOW text in the changed SRS lines: no table, column, function or endpoint names, algorithms, storage
     layout or internal codes (technology choices are fine). Check with `git diff origin/main -- docs/srs`.
   - Every FR changed has its status row in `17-traceability.md` (Built / Partial / Planned + initiative).
   - A ⭐ default built without Afik's answer has an OP row "built per ⭐, awaiting confirmation" and a line in
     WORKPLAN "ממתין לך".
   - A version row in `00-document-info.md`; `node tools/build-srs-index.js` passes.
6. **Every account type.** Every screen the PR changed works for every account type that can reach it (Regular,
   Professional, Moderator, Admin — per brief (f)): no error and no empty screen. Cite the test that shows it, per
   account type.
7. **Cross-cutting decisions.** Every cross-cutting decision listed in brief (b) (the 500-character free-text field
   and "אחר" in every report, a relative time on every publication, staff principles, rating display…) is implemented
   in this PR too. Cite the file:line.
8. **Definition of done (brief e):** pgTAP for every new table/policy, server tests, the e2e-preview flow, SRS,
   status row.

## Output

One table, only the gaps (nothing else; no praise, no summary of what is fine):

| ID / rule | Missing | Where it should be |
|---|---|---|

Then one line: `BLOCK` (any gap) or `PASS`. A gap blocks the merge, unless Afik decided it is for later — then it
goes to WORKPLAN with his reason, and the line in the table says so.

## Stop conditions

- No PR diff, or the brief is missing and cannot be written → say so; do not guess.
- Read-only: never edit code, tests or the SRS. The builder fixes.

## Changelog
- 1.0 — 2026-10-21 — created (Afik, 21.10: the gate before every initiative's code merge).
- 1.1 — 2026-10-21 — every account type per changed screen; cross-cutting decisions from brief (b) (Afik).
