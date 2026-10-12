# notes — Situation room, slices 2-4 (server, live view, history views)

**Approach**
Four files in `tools/situation-room/`. `derive.mjs` is pure: allowlist on read, part/step, stepper, usage, rounds,
`incidents.md` parser, blocks over time, git-log parser, `buildSummary`. `sources.mjs` is IO: the per-day tail,
the `incidents.md` reader, `readCommits` (git through `execFile`, no shell, fixed arguments). `server.mjs` is HTTP:
`createRoom({root, port, pollMs})` returns `{server, start(), stop()}`; it also runs as `npm run situation-room`.
`index.html` has two views (live, history) behind two buttons. The server holds the sanitized, annotated events in
memory, loaded from every retained day file at start. `/events` sends the last 6000 as the first message (`init`),
then each new batch. `/summary?days=N` (1-90, default 30) computes the history over all of them, not the backlog.

**URL and how to open it:** `npm run situation-room` prints `http://127.0.0.1:6010`. Open it in a browser. A port
as the first argument (`node tools/situation-room/server.mjs 6011`) overrides 6010. Checked: `GET /` 200 with
`lang="he" dir="rtl"` and no `http(s)://`; `Host: evil.com` 403; POST 405; `/.env` (written as a dot-env path),
`/../x`, `/incidents.md`, `/.live/events.jsonl` 404. Servers stopped after the check.

**Decisions**
- `part`/`step` are annotated by the server (stateful `createStepper`) and sent to the page on every event. The page
  contains no derivation, and nothing serves `derive.mjs` to the browser. This keeps the whitelist at four paths.
- The server does not read the old `.live/events.jsonl` at all, only `events-YYYY-MM-DD.jsonl`. The draft content
  therefore cannot reach any output, and the file stays untouched (open question 1 is still Afik's).
- The allowlist in `derive.mjs` is a second copy of the hook's list, on purpose: widening the hook does not widen
  what the room shows. Also checked on read: types, string clip at 200, `target` naming `.env` is dropped.
- Page text and badges use the text colour; the role colour is only the card's side stripe. The draft's role
  colours failed AA on white as text. Light-theme accent/live/bad were darkened for AA.
- Rounds cut-off: a part's last merge on main is found by matching the merge-commit subject to the part name
  ("Merge UI wave 1 part e" matches `ui-wave-1/part-e`). If no subject matches, the part shows "טרם מוזג" and all its
  runs count. Heuristic; the commit subjects in this repo happen to follow the convention.
- `readCommits` uses `main` if it exists, else `HEAD`.
- Block count for `incidents.md` is by role (the role in parentheses, or the `role ×n` breakdown); the first
  aggregated line has no breakdown and counts as role `unknown`. Entry minute = start of the logged time range.
- `/events` carries objects, not raw lines (the draft sent lines).

**Deviations**
- None from criteria. Section 3.2's "up to the part's last merge on main" is implemented as the heuristic above.
- The history button exists in the slice 3 commit but only works from slice 4 (they are separate commits, one page).

**Deliberately not done**
- No test files (TEST ENGINEER). No ESLint/size config for `tools/situation-room/` (the repo's rules cover
  `tools/eslint-rules` only; the new `.mjs` files lint clean under the default config).
- No deletion of the old `.live/events.jsonl`. No Storybook/axe (open question 3). Manual AA check: contrast chosen by
  the palette above, focus ring on every control, state always has a text label (badge "עובד"/"ממתין", "מיזוג",
  "אין נתונים"). Not measured with a tool.
- Windowing the history in memory: all retained events are kept in memory (worst case ~300 MB of files). Fine
  for the normal volume, not tested at the cap.

**Exports for the tests**
- `derive.mjs`: `sanitizeEvent(obj)`, `parseLogLine(line)`, `splitBranch(branch)` -> `{feature, part}` (`part` is
  `NO_PART`, "ללא חלק", when none), `partKey`, `createStepper().annotate(ev)` -> event plus `feature`, `part`, `step`
  (numbers; `"5b"`; `"support"` for scout with no running caller; `null` for orchestrator), `usage(events)` ->
  `{agents:[{who, runs, running, ms, parts:[{feature, part, runs, running, ms}]}], skills:[{name, uses, ms, parts}]}`,
  `rounds(events, mergedAt?)` -> `[{feature, part, critic, testEngineer, afterMerge, mergedAt, lastRunAt}]`,
  `parseIncidents(text)` -> `[{t, date, role, tool, count}]`, `blocksOverTime({incidents, events, fromT, toT, firstEventT})`
  -> `{firstDate, days:[{date, noData, total, roles, tools}], points}`, `dayRange`, `dayKey`, `parseGitLog`, `mergeTimes`,
  `buildSummary({events, incidentsText, commits, now, days})`.
- `sources.mjs`: `createTail(logDir).poll()` (the whole history on the first call, then only what is new),
  `readCommits(dir)`, `readIncidents(root)`.
- `server.mjs`: `createRoom({root, port: 0, pollMs})` -> `start()` resolves `{port, url}`; `stop()`. Importing it does
  not start anything.
- Events passed to `usage`/`rounds` need `ev`, `t`, `branch`, `who`, `aid`; `sid` is not used by them.

**Uncertain**
- Memory use and poll cost with 60 full day files (stat per file every 400 ms) are not measured.
- Timeline SVG was checked by generating it from real data, not by eye in a browser.
- `incidents.md` "unknown" role for the 6-block line is a judgement; its text names no roles.
- Day keys use the machine's local time zone, like the hook's file names.

**Preview path**
1. `npm run situation-room`, open `http://127.0.0.1:6010`.
2. "חי": agent cards show the task, branch, part, step, skills; a blocked command (e.g. a shell command naming the
   preview env file) appears in "יומן חי" in bold with the reason only; no prompt line, no "done" summary.
3. "היסטוריה": the notice states the first-event date; usage tables (open the part split); rounds; blocks per day
   with "אין נתונים" before 11.10; timeline with merges (diamond) and a list under it. Range selector 7-60 days.
Known not to work: nothing live depends on a browser I could not open; the page was exercised against the real
server with a DOM stub.

**Neighbouring**
- Anything of the 15 "TEST ENGINEER" blocks in `incidents.md` between 09:42 and 10:11 on 12.10 is the same
  friction as earlier parts (reads `apps/*/src`); not touched.
- `incidents.md` has uncommitted lines (written by the guard); left alone.
