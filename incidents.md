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
| a hook block the guard escalates — prod, a secret, `.env`, force push, or the third reader block by one role in one session | an agent may be probing a guardrail. **always reported**; other correct blocks are counted by `/wrap-up` (decisions/2026-10.md, guard approach d and F5) |
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

2026-10-12 12:20 | CI red on main: every GitHub Actions run of `ci.yml` failed, runs 1–21 (7.2 onward); in run 21 only the `test` job failed ("Process completed with exit code 1"), and typecheck, lint, build, storybook, browser and audit passed. `npm test` passes locally on Windows, with one unexplained failure in two runs. The job log needs a GitHub sign-in, so the cause is not yet known | every merge since 7.2 was reported "CI green" from local runs only; no production impact (no product screen, no migration) | state: open | ORCHESTRATOR reported to Afik; the first task of the next session, before 9.7 part f
2026-10-12 13:20 | (resolution of 12:20, CI red on main) cause: one guard test, `guard.test.js:245` (`type .work\f\NOTES~1.MD`), passed only on Windows, because `fold()` lowercases on win32 alone and the runner is Linux. All 22 red runs had this one failure and no other (`gh run view --log-failed`). Fixed in PR 1 (`guard.js:509`, `/i`); every check green on GitHub, run 38235017642 | none beyond the line above | state: resolved | standing rule: no merge without green GitHub CI (workflow.md 1.7, decisions.md)
2026-10-12 23:52 | db-check (I1 prep, step 6): 2 of 4 manual runs failed at login before both environments passed. Afik reset the nestly-preview `app_owner` password during the check and updated the `db-preview` secret to match. The workflow prints only fixed messages; no log content was copied into chat | none: preview only, no migration exists yet; both environments then passed (db-preview and db-production, the latter after Afik's approval) | state: resolved | logs not read by ORCHESTRATOR, at Afik's request
2026-10-12 23:55 | Vercel posted no deployment status for 67b2bb6 and 15b7fc7 (end of PR 3 and its merge on main), after a day of many pushes on many branches; suspected the Hobby daily deployment limit | the main-branch site may not carry 9.7 part f until the next deploy | state: contained | Afik approved building only main and PR branches (decisions.md, ignoreCommand, PR 4); PR 4 deployed. Whether skipped builds still count toward the limit: check after the next busy day (CRITIC QUESTION, .work/i1-prep/findings.md)
2026-10-12 23:58 | hook blocked a remote branch delete (`git push origin --delete` of six merged branches) at wrap-up | none, no call ran | state: resolved | correct block (decisions.md 2026-10-11): Afik deletes remote branches by hand
2026-10-13 11:18 | hook blocked Bash (test-engineer): third reader block by test-engineer in one session (the fence is being probed): TEST ENGINEER runs one test command at the project root, nothing else: `npx vitest run <files>`, `npx playwright test <files>` or `node --test <files>`. Files are explicit relative paths of existing *.test.* / *.spec.* files outside apps/*/src and apps/*/api; no globs, quotes, pipes, `cd` or variables. Flags (--name=value only): vitest --reporter=default|verbose|dot --bail=N --no-color --testNamePattern=X; playwright --project=X --grep=X --reporter=list|line|dot --workers=N; node --test-name-pattern=X --test-reporter=spec|dot|tap. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 11:18 (resolution) | the escalation above: TEST ENGINEER, updating the old guard tests while the new guard was already live in the working tree, ran three test commands in forms the new allowlist refuses (learning the new limits), then the allowed form; no read of app source or notes.md was attempted | none | state: resolved | noise.md entry; the escalation worked as designed
2026-10-13 11:34 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 11:35 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 11:35 (resolution) | the two blocks above: ORCHESTRATOR's grep over the block archive used the text ".env" as a search pattern, then a printf recording that block quoted it again; no .env file was named or read | none | state: resolved | false blocks, noise.md
2026-10-13 12:10 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 12:10 (resolution) | the block above: an inline `node -e` script that edited incidents.md quoted the text ".env" in a table row; no .env file was named or read. ORCHESTRATOR broke its own new convention ("Git and shell") and reran the script from a file | none | state: resolved | false block, noise.md
2026-10-13 13:45 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 13:45 (resolution) | the block above: a grep over noise.md and conventions.md whose search pattern was the text ".env"; no .env file was named or read. Reported to Afik in the session; Afik decided the same day to fix the rule (`.work/guard-env-paths/`) | none | state: resolved | false block, noise.md
2026-10-13 14:08 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 14:08 (resolution) | the block above: BUILDER, while fixing the rule, ran an inline `node -e` script whose code held the text ".env". Inline interpreter code keeps the text check under the new rule, so this is a correct block by design, not noise; the script was rerun from a file. Reported to Afik in the session | none | state: resolved | correct block
2026-10-13 14:21 | hook blocked Bash (all): Shell commands do not touch .env files: they hold Afik's secrets. SQL on preview runs through `node tools/db-preview.mjs`, which reads .env.preview itself. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 14:21 (resolution) | the block above: ORCHESTRATOR's inline `node -` script editing WORKPLAN quoted the text ".env" — a correct block under the new rule (inline code keeps the text check), no file touched; rerun from a script file. Not a real event: from 13.10 such lines are noise only (Afik), but the guard writes this one itself | none | state: resolved | correct block
2026-10-13 15:20 | hook blocked Bash (all): The changes being committed contain what looks like a database URL with a password. Remove it, and rotate it if it is real. The repo is public. | the call did not run | state: contained | ORCHESTRATOR reports to Afik
2026-10-13 15:20 (resolution) | the block above: a placeholder URL in .work/identity-platform/schema.md (password written as "…"), no real credential; the placeholder was reworded | none | state: resolved | false block, noise.md
