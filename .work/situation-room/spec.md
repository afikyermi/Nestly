# Situation room (internal tool)

**Gate 1: approved by ORCHESTRATOR, 12.10.2026.** Q2–Q5 accepted as stated. Q1 (the draft log already holds content)
goes to Afik — deleting it is destructive; until he answers, the server drops unknown fields on read. Containment done
before the build: the draft hook no longer writes prompt text, assistant messages, skill or prompt arguments, URL paths,
or anything naming `.env` (verified with a probe).

**Problem**  Afik cannot see the agent system at work. While a pipeline runs he does not know which agent is active,
on what, at which step, which skills were loaded, or that a guard blocked something. Afterwards he cannot answer "how
many CRITIC rounds did part d take", "which skill is never used", "how many blocks this week". The existing draft
partly shows the live state but logs content it must not (prompt text, last assistant message, skill args, full URLs,
`.env*` paths) and has no history.
**Requirements**  None in the SRS (internal tool, not product). Source is `intake.md`, rules cited below as I1-I9:
I1 live · I2 history · I3 local only · I4 no content · I5 observe only · I6 gitignored + cap · I7 one command ·
I8 Hebrew RTL · I9 tests + CRITIC. A `decisions.md` entry "Situation room" must exist (the draft cites it; it does not).
**Scope**  (a) the logger hook; (b) a Block event from `guard.js`; (c) the local server: live stream + history
summaries; (d) the page: live view + history views. Delivered in 4 slices (see Size).
**Out of scope**  Any content logging, including "just the first N chars" · verdicts (Ready/Not Ready), since they live
in assistant text · token or cost counts · anything remote, auth, accounts, sharing · editing or deleting data from
the room · alerts or notifications · replacing `guard.js` or the `incidents.md` record · backfilling agent/skill usage
before logging began · mobile layout polish · Storybook/Playwright for the page (open question 3) · changing any other
hook.
**Data touched**  No product tables, no stored media. Files: `.live/` (gitignored log, new schema), `incidents.md`
(read only), `git log` (read only), `.claude/settings.json` (hook timeout only), `.claude/hooks/guard.js` (one added
write). Risk flags: none of CLAUDE.md's; a change under `.claude/` means CRITIC reviews it as it reviewed the guard.

## 1. Data model: what the hook may write

Common to every event: `t` (ms epoch), `ev` (event name), `sid` (session id), `aid` (agent id, only inside a
subagent), `who` (agent type lower-cased, or `ORCHESTRATOR` when there is no agent type), `branch`. Nothing else is
common. `part` and `step` are **not stored**: they are derived when read (shared pure functions, one place).

| Event | Extra fields, and nothing more |
|---|---|
| SessionStart | `source` (startup/resume/clear..., clipped 20) |
| UserPromptSubmit | none. The prompt is never read into the event |
| UserPromptExpansion | `skill` (the command name, clipped 60). No `command_args` |
| PreToolUse | `tool`, `id` (tool_use_id), `target`, plus `skill` (Skill: the skill name only) · Agent/Task: `subagent` (subagent_type, default `general-purpose`), `target` = the Agent `description` |
| PostToolUse | `tool`, `id`, `ms` (duration_ms) |
| PostToolUseFailure | `tool`, `id`, `ms`, `failed:true`, `interrupt` (bool). No error text |
| SubagentStart | none beyond common |
| SubagentStop | none beyond common. No last assistant message |
| Stop / SessionEnd | `reason` (clipped 40) |
| Block (new, from guard) | `role` (guard role), `tool`, `id`, `reason` (see section 2) |

`target` by tool: Read/Write/Edit/MultiEdit/NotebookEdit = file path, project-relative when inside the project;
Grep/Glob = `pattern` (clip 80); Bash/PowerShell = the tool's `description` only, never `command`, and absent when
there is no description; Agent/Task = `description` (clip 120); WebFetch = **hostname only**; WebSearch = no target;
Skill = no target; anything else (MCP tools included) = no target, the tool name is enough.
**Env rule, applied to every `target`:** if the value contains a `.env` token (`.env`, `.env.preview`, `apps/x/.env`,
a glob such as `**/.env*`), `target` is omitted entirely. The event is still written.
Strings are collapsed to one line and clipped. `bg`, `cwd`, `text`, `last`, `args`, `query` from the draft are gone.
**Derived on read.** `part`/`feature` from `branch`: `<feature>/<part>` splits at the first `/` (`ui-wave-1/part-e` ->
feature `ui-wave-1`, part `part-e`); no `/` -> feature = branch, no part; `main`, a detached SHA or none -> "ללא חלק".
`step` from `who`, workflow.md numbering: spec 3 · data-architect 5 · algorithm-data 5b · builder 6 (10 once a critic
run exists in the same part) · test-engineer 8 · critic 9 (11 from its second run in the part) · scout = support,
shown under its caller's step · ORCHESTRATOR = orchestration (1,2,4,12-14 are not distinguishable from events).

## 2. Blocks in real time

Reason text may only reach the log after a scrub, because three guard reasons are not static: `A .env file is staged
(<name>)` carries a file name, `unknown role "<x>"`, `guard error (<message>)`. Scrub: cut at the first ` (` for the
staged-env reason, drop the quoted role, drop the error message. Generic wording such as "do not touch .env files" is a
rule name, not a file name, and is allowed (open question 2).

| Option | For | Against |
|---|---|---|
| A. server tails `incidents.md` | guard untouched | no session/agent id, minute resolution, aggregated lines ("18 hook blocks") cannot be parsed live, the file is git-tracked: checkout/stash/rebase rewrites it and fakes or hides blocks, only written if the file exists |
| B. guard also appends one `Block` line to the log | exact time, session, agent, tool id, same stream as everything else; blocks the call that never gets a Post event | edits a security hook; needs a fail-closed proof |
| C. infer a block from Pre with no Post | no guard change | cannot tell a block from a slow or killed call; no reason |

**Recommend B**, with `incidents.md` unchanged as the official record. Conditions, all testable: the write happens
after `report()` and inside its own try/catch; `situation-log.js` is `require`d lazily inside that try, so a missing
or broken file cannot crash the guard (a crash exits 2 on every call); exit code stays 2 and the stderr message
unchanged whatever the write does; logged only when `report()` is, so a block shows once (existing
`loggedElsewhere` rule); every existing guard test passes untouched. For blocks **before** the first `Block` event in
the log, history reads `incidents.md`; after it, history counts the log only (no double count).

## 3. History views

Computed by the server over all retained log files, not the browser's 2 MB backlog.
1. **Usage per agent type and per skill**: runs/uses, total duration, and a per-part split. Agent run duration =
   SubagentStart to SubagentStop. Skill duration = sum of `ms` of its Skill tool calls (load time only, not time
   spent working with it); slash expansions count as uses with no duration.
2. **CRITIC and TEST ENGINEER rounds per part**: runs counted per part (branch at SubagentStart). "Until approved" is
   **not knowable** (the verdict is assistant text); show rounds up to the part's last merge on main.
3. **Blocks over time**: per day and per role/tool, from `incidents.md` (before logging) plus `Block` events.
4. **Timeline**: first-parent commits of `main` from local `git log` (merge commits, `parents>1`, marked as merges),
   agent runs and parts as spans, blocks as points.
**History that exists before logging started:** only `incidents.md` (blocks from 2026-10-11, mixed per-line and
aggregated forms) and git. No agent, skill or duration data exists before the first valid event; each view states
"נתונים מ-<first event date>". Nothing is backfilled.

## 4. Non-functional requirements

- **Hook**: exit 0 always, stdout and stderr empty, never reads stdin beyond the JSON. **N = 150 ms p95 wall time per
  invocation on Afik's machine, and at most 30 ms above a bare `node -e ""` start.** Measure: 100 runs of a
  PreToolUse Edit event versus 100 runs of the baseline, reported in `notes.md`; the automated ceiling is a median
  of 20 runs <= 300 ms (CI machines vary). No subprocess (no `git`), no network. Settings timeout lowered 5 s -> 2 s.
- **127.0.0.1 only**; a request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` gets 403 (DNS rebinding);
  GET only; no CORS headers; serves only the page, `/events`, and the summary endpoint(s); no path from the request
  reaches the file system. Port in use -> a one-line Hebrew-or-English error and exit 1.
- **Size**: log in per-day files `events-YYYY-MM-DD.jsonl`, 5 MB cap per file (excess events dropped, Block events
  never dropped), 60 days retention, pruned when a new day's file is created. No rename, so concurrent subagents
  cannot race a rotation. Worst case 300 MB, typical under 75 MB. (Mechanism is the builder's if the criteria hold.)
- `.live/` stays in `.gitignore`. Worktree sessions write to the main checkout's `.live/` (keep).
- **One command**: `npm run situation-room`, prints `http://127.0.0.1:6010`. Page `lang="he" dir="rtl"`, AA contrast
  in light and dark, visible focus, state never by colour alone, no external fonts/scripts/requests.

## 5. Acceptance criteria

Tag: **U** unit test, **L** lint/CI check. Source in brackets.

Hook (`situation-log.test.js`)
1. U Any event exits 0 with empty stdout and stderr: valid JSON, invalid JSON, empty stdin, unwritable `.live`. [I5]
2. U UserPromptSubmit with `prompt:"SECRET-PROMPT-7"` -> no log byte contains it; the line has no `text` field. [I4]
3. U SubagentStop with `last_assistant_message:"SECRET-MSG"` -> absent; no `last` field. [I4]
4. U Bash with `command:"export T=SECRET-CMD"` and no description -> line has no `target`, no SECRET-CMD; with a
   description -> `target` equals it. Same for PowerShell. [I4]
5. U Skill with `args:"SECRET-ARGS"` -> line has `skill` and nothing from args; UserPromptExpansion with
   `command_args` -> same. [I4]
6. U WebFetch `https://example.com/p?token=SECRET-Q#f` -> `target` is `example.com`; WebSearch -> no target. [I4]
7. U Read/Write/Edit on `.env`, `.env.preview`, `apps/web/.env.local`, `C:\x\.env.example`; Grep pattern
   `**/.env*`; a Bash description "read .env.preview" -> `target` omitted in each, event still written, and no log
   line matches `/\.env/i`. [I4]
8. U Read of `apps/web/src/a.tsx` -> `target` `apps/web/src/a.tsx`; an absolute path inside the project is relative. [I1]
9. U Write/Edit with `content`, `new_string`, `old_string` set to a marker -> marker never in the log. [I4]
10. U Property test: for every event name in the table, the written keys are a subset of the allowed list in
    section 1; any extra input key never appears. [I4]
11. U `who` is the lower-cased `agent_type`, or `ORCHESTRATOR` when absent or empty; `branch` read from `.git/HEAD`
    (normal checkout and worktree), absent outside git. [I1]
12. U PostToolUse carries `ms`; PostToolUseFailure carries `failed:true` and no error text. [I1]
13. U Worktree session writes to the main checkout's `.live`. (kept) [I1]
14. U Two concurrent invocations x 50 -> 100 intact JSON lines. [I5]
15. U A file at the 5 MB cap does not grow; a Block event is still appended. [I6]
16. U Median of 20 invocations <= 300 ms. [I5]
17. L `.claude/settings.json` wires the hook on all ten events with timeout 2; `.gitignore` has `.live/`;
    `test:tools` runs `situation-log.test.js`; `npm run situation-room` exists. [I6, I7]

Guard (`guard.test.js`, existing tests unchanged)
18. U A blocked call writes exactly one `Block` line with `role`, `tool`, `id`, `reason`, `sid`, `who`, and no
    `command`. [I1, I4]
19. U The staged-`.env` reason is logged without the file name; `unknown role "x"` without `x`; `guard error` without
    its message. [I4]
20. U Log directory unwritable, and `situation-log.js` missing or throwing on load: the guard still exits 2 with the
    same stderr text; an allowed call still exits 0. [fail-closed]
21. U Block shown once when both the settings hook and the agent hook run. [existing rule]

Server and summaries (`tools/situation-room/*.test.mjs`)
22. U Binds 127.0.0.1 only; `Host: evil.com` -> 403; POST -> 405; `/../x`, `/.env`, `/incidents.md` -> 404. [I3]
23. U On read, any field outside the allowlist is dropped, so an old draft-format line with `text`/`last` never
    reaches `/events` or the summaries. [I4]
24. U `/events` sends the backlog, then a line appended later, once; a day rollover loses no line. [I1]
25. U `part`/`step` derivation: `ui-wave-1/part-e`, `main`, no branch, detached SHA, `a/b/c`; critic run 1 -> 9, run 2
    in the same part -> 11; builder after a critic run -> 10. [I1]
26. U Per-agent and per-skill usage on a fixture: counts, total duration, per-part split exact; empty log -> empty
    result, no exception; an unmatched Start (agent never stopped) is counted as running, not given a duration. [I2]
27. U Rounds: fixture with 3 critic and 2 test-engineer runs in part-e and 1 critic in part-d -> 3/2/1. [I2]
28. U `incidents.md` parser, using the real lines 36-50 as fixtures: single line = 1; `hook blocked Bash (all) ×2` = 2;
    `18 hook blocks ... all ×3 · test-engineer ×9 · critic ×6` = 18 split by role; a garbled line is skipped, not
    thrown. [I2]
29. U Blocks over time: incidents.md lines before the first `Block` event plus log events after it; a block present
    in both counts once. [I2]
30. U Git timeline: a fixture repo with a merge commit and a plain commit -> two points, only the first marked merge;
    a directory with no git -> empty timeline. Git invoked without a shell, fixed arguments. [I2]
31. U Views state the first-event date; with a log starting 12.10 and a range from 01.10 the earlier days show "no
    data", not zero. [I2]
32. L `npm run situation-room` starts the server and `GET /` returns 200 with `lang="he"` and `dir="rtl"`; the HTML
    references no `http(s)://` resource. [I3, I7, I8]
33. L ESLint and typecheck gates pass on the new files; `situation-log.test.js` and the server tests are in
    `test:tools`. [I9]
34. L `decisions.md` has the "Situation room" entry (ORCHESTRATOR writes it). [I9]

## Open questions
1. Existing `.live/events.jsonl` already holds prompt text and assistant messages from the draft. → **assumed if
   unanswered:** the server strips on read (criterion 23) and the file stays; deleting it is a destructive command, so
   ORCHESTRATOR asks Afik before it. **Also: the draft hook is live now and keeps logging prompts; ORCHESTRATOR should
   disable its wiring until slice 1 ships.**
2. Is the generic phrase ".env files" inside a block reason acceptable (a rule name, no file)? → **assumed:** yes.
3. Does the internal page need Storybook/Playwright/axe? → **assumed:** no; manual AA check recorded in notes.
4. Timeline "merge" when merges are squash commits with one parent? → **assumed:** all first-parent commits of `main`
   are timeline points, true merges marked. Commit subjects are read from git at request time, never logged.
5. Rounds are "runs", not "until approved" (verdict not loggable). → **assumed:** runs up to the part's last main commit.

## Size estimate
About 1,100 lines of diff in total, over ~400 → split into four slices, each its own `.work/` slug, in this order:
1. **log** (~330): hook rewrite to the section 1 table, per-day files and cap, guard Block event, settings timeout,
   criteria 1-21, 34, 17. Ships first; it closes the live content leak.
2. **server** (~380): shared derive/parse module, allowlist-on-read, Host check, day-file tailing, incidents/git
   readers, summary endpoint, criteria 22-24, 28-30, 32 (server part).
3. **live view** (~300): page without prompt/last text; session task = branch/part + current tool target; agent
   cards with step; Block events in the feed; criteria 25, 32 (page).
4. **history views** (~380): usage, rounds, blocks over time, timeline; criteria 26, 27, 29, 31.

## 6. Draft: keep, change, drop
- **Keep**: observe-only shell (exit 0, uncaughtException -> 0, silent) · Bash by description · worktree writes to
  main checkout · reading branch from `.git/HEAD` without a subprocess · SSE with backlog and byte offset polling ·
  127.0.0.1 binding · Hebrew RTL page, theme variables, role colours · test for bad input and worktree.
- **Change**: `target()` per section 1 (WebFetch host only, `.env` scrub, no Skill args) · `atype` -> `who` with
  ORCHESTRATOR · branch on every event · single 5 MB `.1` rename -> per-day files (a rename races concurrent hooks
  and loses history after ~10 MB) · history from the server, not the browser backlog · timeout 5 s -> 2 s · server
  allowlist on read · comment `situation-log.js` says `server.js`, it is `server.mjs`.
- **Drop**: prompt `text`, `last`, `args`, `command_args`, `cwd`, `query`, `bg` · session card "prompt" line and the
  "done" card summary paragraph · "skills today" as the only skill view.
