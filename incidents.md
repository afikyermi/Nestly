# Incidents

Material operational failures. Afik is told about every entry here.

Not only security — anything where a component, environment or capability stopped working.

```
YYYY-MM-DD HH:MM | <what failed> | impact | state: open | contained | resolved | action
```

---

## What counts as material

| Event | Why |
|---|---|
| **migration failed mid-run** | the schema is in an undefined state. the most serious entry this file can hold |
| CI red on `main` | the main branch is broken; everything built on it is suspect |
| CI red over 24h | the pipeline is muted in practice, even if nobody said so |
| deploy or preview failed | Gate 2 is gone |
| a hook blocked an action | an agent attempted to cross a guardrail. **always reported** |
| external dependency down | storage, auth, database |
| an agent looped, or repeated the same failure three times | a failure of the agent system, not of the product |
| secret detected in a commit or in output | contain first, then report |

## Rules

- Immediate containment is allowed within existing permissions. Containment is not a baseline change.
- A permanent fix goes back through normal change control. An emergency action never silently becomes
  the new design.
- Every entry is logged even when it was resolved in a minute. The pattern matters more than the
  individual event.

---

2026-10-11 18:26 | 6 hook blocks, all deliberate: the live probes that activated the 7.2 guard (main loop git add -A; CRITIC git diff without the notes.md exclusion; TEST ENGINEER Read of apps/web/src, logged twice before the single-log fix; BUILDER Write and redirect into tests/) | none, no call ran | state: resolved | WORKPLAN 7.2/7.3: verification, not an incident
2026-10-11 19:02 | (resolution of the line above) ORCHESTRATOR combined git add and git commit; the rule worked as designed, the commands were split | none | state: resolved | —
2026-10-11 20:42 | hook blocked Bash (all) ×2, the .env rule: the ORCHESTRATOR's commit message, then a sed recording it, named the preview env file as text | none, no call ran | state: resolved | a false positive on the commit message (noise.md), guard fixed; the sed block was correct — edited with the Edit tool instead
2026-10-11 21:34 | hook blocked Bash (all), the .env rule: a `node -` heredoc (a WORKPLAN update script) named the preview env file in its text | none, no call ran | state: resolved | correct block — a heredoc fed to node is a script; the update ran from a script file instead
2026-10-11 22:00–22:10 | 15 hook blocks during UI wave 1 part a, all correct under the rules: BUILDER ×3 (git add -A; git add + commit combined, ×2) · CRITIC ×2 (git diff without the notes.md exclusion; a recursive shell search) · TEST ENGINEER ×10 (reads of apps/*/src paths, one git diff) | none, no call ran; each agent took the allowed path | state: resolved | friction to watch: TEST ENGINEER needed apps/web/src/styles/tokens.generated.css, a build product of the packages/shared contract — an exemption is a candidate if the pattern repeats in part b
2026-10-11 22:18–23:59 | 18 hook blocks during UI wave 1 part b and the 7.3 commit, all correct under the rules: all ×3 (git add + commit/checkout combined) · BUILDER ×2 (mkdir e2e — the e2e path is a test path) · CRITIC ×2 · TEST ENGINEER ×11 (reads and a Glob reaching apps/*/src) | none, no call ran; each agent took the allowed path | state: resolved | TEST ENGINEER friction repeats from part a: it learns component APIs from stories because the spec names none — SPEC adds an API line per component for parts c–f
2026-10-11 19:02–00:00 | 18 hook blocks during UI wave 1 part c, all correct under the rules: all ×6 · test-engineer ×10 · critic ×2 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond parts a–b
2026-10-12 00:18–01:07 | 18 hook blocks during UI wave 1 part d, all correct under the rules: all ×3 · test-engineer ×9 · critic ×6 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond parts a–c
2026-10-12 07:32–09:16 | 22 hook blocks during UI wave 1 part e, all correct under the rules: builder ×1 · all ×3 · test-engineer ×11 · critic ×7 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; no new pattern beyond the earlier parts
2026-10-12 09:35–11:13 | 26 hook blocks during tooling work and UI wave 1 part e, all correct under the rules: all ×5 · test-engineer ×17 · critic ×4 — combined git add/commit, reads of apps/*/src by TEST ENGINEER, git reads without the notes.md exclusion by CRITIC | none, no call ran; each agent took the allowed path | state: resolved | reviewed by ORCHESTRATOR; the TEST ENGINEER `$?` blocks among them were false positives, fixed in the guard (noise.md)
2026-10-12 11:40 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 11:41 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 11:53 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 12:20 | CI red on main: every GitHub Actions run of `ci.yml` failed, runs 1–21 (7.2 onward); in run 21 only the `test` job failed ("Process completed with exit code 1"), and typecheck, lint, build, storybook, browser and audit passed. `npm test` passes locally on Windows, with one unexplained failure in two runs. The job log needs a GitHub sign-in, so the cause is not yet known | every merge since 7.2 was reported "CI green" from local runs only; no production impact (no product screen, no migration) | state: open | ORCHESTRATOR reported to Afik; the first task of the next session, before 9.7 part f
2026-10-12 13:06 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: name the .work/ files you read; a wildcard there could reach notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Read (critic): CRITIC does not read notes.md (the builder's own account). | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: name the .work/ files you read; a wildcard there could reach notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Read (critic): CRITIC does not read notes.md (the builder's own account). | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: name the .work/ files you read; a wildcard there could reach notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: do not cd into .work/; name the files you read. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC: name the .work/ files you read; a wildcard there could reach notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Read (critic): CRITIC does not read notes.md (the builder's own account). | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:08 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:20 | (resolution of 12:20, CI red on main) cause: one guard test, `guard.test.js:245` (`type .work\f\NOTES~1.MD`), passed only on Windows, because `fold()` lowercases on win32 alone and the runner is Linux. All 22 red runs had this one failure and no other (`gh run view --log-failed`). Fixed in PR 1 (`guard.js:509`, `/i`); every check green on GitHub, run 38235017642 | none beyond the line above | state: resolved | standing rule: no merge without green GitHub CI (workflow.md 1.7, decisions.md)
2026-10-12 13:06–13:08 | (note on the 13:06–13:08 critic blocks above) CRITIC's probes while reviewing PR 1: it ran guard.js with the platform forced to linux and darwin to test each notes.md rule; the blocks are the probe's expected results, not reads by CRITIC | none | state: resolved | the probe logged to the real incidents.md; future probes set CLAUDE_PROJECT_DIR to a throwaway root, as guard.test.js does
2026-10-12 13:59 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 13:59 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:00 | hook blocked Bash (test-engineer): TEST ENGINEER does not read the implementation through git (diff, show, log -p, blame, grep). | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:00 | hook blocked Bash (test-engineer): TEST ENGINEER does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:10 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:12 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:15 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:16 | hook blocked Bash (all): `git add -A` and `git add .` are blocked. Stage the files by name. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 14:17 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 15:06 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 15:07 | hook blocked Grep (test-engineer): TEST ENGINEER does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 15:07 | hook blocked Glob (test-engineer): TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 15:14 | hook blocked Bash (test-engineer): TEST ENGINEER does not cd into an app. Use apps/<app>/tests paths from the root. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:07 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:07 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:12 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:14 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:35 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:45 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:46 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:47 | hook blocked Bash (critic): CRITIC does not search recursively from the shell (it could reach notes.md). Use the Grep tool with a glob or type. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 18:49 | hook blocked Bash (critic): CRITIC does not read notes.md. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:00 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:00 | hook blocked Grep (test-engineer): TEST ENGINEER does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:00 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:00 | hook blocked Grep (test-engineer): TEST ENGINEER does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:00 | hook blocked Glob (test-engineer): TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:01 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:01 | hook blocked Grep (test-engineer): TEST ENGINEER searches only where app source is out of reach. Point the path at apps/<app>/tests, packages/shared, e2e, supabase/tests or .work/<slug>. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:08 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:23 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:23 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 19:26 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 21:42 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 21:42 | hook blocked Bash (builder): BUILDER does not write tests. Test files belong to TEST ENGINEER. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 21:50 | hook blocked Bash (test-engineer): TEST ENGINEER does not read apps/*/src or apps/*/api. Use apps/<app>/tests paths. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 22:58 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:00 | hook blocked Bash (critic): CRITIC: a git command that shows file content must exclude notes.md. Add the pathspec `-- . ':(exclude).work/*/notes.md'`. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:00 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:03 | hook blocked Bash (all): nestly-prod (and the retired projects) are out of reach for agents. Production changes go through CI with Afik's approval. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:05 | hook blocked Bash (all): Run `git add` and `git commit` as separate commands, so the staged diff can be checked for secrets first. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:06 | hook blocked Grep (critic): CRITIC does not read notes.md. A search that reaches .work/ needs a glob or type that cannot match notes.md (e.g. glob "*.ts" or type "ts"), or a narrower path. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:54 | hook blocked Bash (all): Force push, mirror push and remote deletes are blocked (decisions.md, 2026-10-11). Only Afik does these, by hand. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-12 23:52 | db-check (I1 prep, step 6): 2 of 4 manual runs failed at login before both environments passed. Afik reset the nestly-preview `app_owner` password during the check and updated the `db-preview` secret to match. The workflow prints only fixed messages; no log content was copied into chat | none: preview only, no migration exists yet; both environments then passed (db-preview and db-production, the latter after Afik's approval) | state: resolved | logs not read by ORCHESTRATOR, at Afik's request
2026-10-12 23:55 | Vercel posted no deployment status for 67b2bb6 and 15b7fc7 (end of PR 3 and its merge on main), after a day of many pushes on many branches; suspected the Hobby daily deployment limit | the main-branch site may not carry 9.7 part f until the next deploy | state: contained | Afik approved building only main and PR branches (decisions.md, ignoreCommand, PR 4); PR 4 deployed. Whether skipped builds still count toward the limit: check after the next busy day (CRITIC QUESTION, .work/i1-prep/findings.md)
2026-10-12 23:58 | hook blocked a remote branch delete (`git push origin --delete` of six merged branches) at wrap-up | none, no call ran | state: resolved | correct block (decisions.md 2026-10-11): Afik deletes remote branches by hand
