# notes — situation room, slice 1 (log)

**Approach**  Rewrote `.claude/hooks/situation-log.js` to the section 1 table. Each event is built from an explicit
field list (`ALLOWED`); `writeEvent` filters through the same list. `who` = lower-cased agent_type or `ORCHESTRATOR`;
`branch` on every event; `bg`, `cwd`, `atype`, `text`, `last`, `args`, `query` gone. `.env` rule: any target value that
contains `.env` (checked before clipping, case-insensitive, so `.environment` is also dropped) is omitted. Per-day files
`events-YYYY-MM-DD.jsonl` (local date); 5 MB cap per file (non-Block events dropped over it, Block always appended);
retention 60 days, pruned only when a new day's file is first created (by file-name date). No rename. Settings: hook on
the ten events with timeout 2; guard wiring untouched. `.gitignore` `.live/`, `package.json` unchanged from the draft.
Unknown event names are not logged.

**Exported for the guard**  `writeEvent(event, projectDir)` from `.claude/hooks/situation-log.js`.
- `event` is already scrubbed by the caller. Shape: `{ ev: 'Block', sid, aid, who, branch, role, tool, id, reason }`;
  `t` is filled with `Date.now()` when absent. Any key not in the common list or the Block list is dropped; unknown `ev` is a no-op.
- `projectDir` is the project directory (the guard's `CLAUDE_PROJECT_DIR` / cwd); worktrees resolve to the main checkout.
- Returns nothing; **throws** on a write failure, so wrap it in the guard's own try/catch, with the `require` lazy inside
  that try. Also exported: `branch(dir)` (reads `.git/HEAD`) and `build`, `target`, `mainRoot`, `ALLOWED`.
- `who` for a Block: the caller supplies it (lower-cased agent type or `ORCHESTRATOR`); no helper is exported for it.

**Measurement** (100 runs each, PreToolUse Edit, Windows 11, node `spawnSync`, bench script in the session scratchpad)

| | median | p95 | mean |
|---|---|---|---|
| `node -e ""` | 50.4 ms | 64.8 ms | 52.4 ms |
| hook | 59.1 ms | 74.6 ms | 61.4 ms |

Hook p95 74.6 ms (limit 150). Above baseline: median +8.7 ms, mean +9.0 ms, p95 +9.8 ms (limit 30).

**Decisions**  Local date for the day file name (Afik's day), not UTC. `tool`, `id`, `sid` are clipped (60/80) and
non-string values dropped. `ms` kept only when a finite number.

**Deviations**  none.

**Deliberately not done**  guard.js (ORCHESTRATOR). Tests (TEST ENGINEER). decisions.md. Server and page.
The `.env` scrub is applied to `target` only, as the spec says; `skill`, `subagent`, `reason` are not scanned.

**Uncertain**  The 2 x 50 concurrent appends rely on `appendFileSync` (O_APPEND) being atomic for lines this small;
I did not test it. A prune racing a reader is harmless (it unlinks only files older than 60 days).

**Test state**  `npm run ci`: typecheck, lint, build and test:build pass; `npm test` 172 pass, 2 fail. The only red is
the draft `situation-log.test.js`: "appends one line per event..." (reads `events.jsonl`, expects `atype`) and "a worktree
session logs to the main checkout" (expects `events.jsonl`). Both assert the old file name or `atype`.

**Preview path**  none for this slice (no UI). Check: run any Claude session; `.live/events-<today>.jsonl` fills and holds
no prompt text.

**Neighbouring**  `.live/events.jsonl` (draft format, holds prompt text) still exists and is no longer written (Q1 for Afik).
