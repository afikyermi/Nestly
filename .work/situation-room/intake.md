# intake — Situation room (internal tool)

**Intent (Afik, 12.10.2026)** — a "situation room" to watch the agent system at work: an internal tool for Afik, not
part of the product.
1. Live, whenever work runs on the project: which agents are active (ORCHESTRATOR, BUILDER, CRITIC, TEST ENGINEER…)
   and what each works on — task, branch, pipeline step; which skills were loaded and when; guard blocks as they
   happen (the reason only, never the command).
2. History: usage per agent and per skill — count, duration, and which feature or part; CRITIC and TEST ENGINEER
   rounds per part until approved; blocks over time (from `incidents.md` and the log); a timeline of all work — who
   worked, tests, merges.
Rules: local only (127.0.0.1, nothing leaves the machine) · no content logged: no commands, no file content, nothing
from `.env*` — only who, what, when and a short description · the hook only observes: always exit 0, prints nothing,
never blocks, never slows; it works next to `guard.js` and does not replace it · the log (`.live/`) is gitignored, with
a size cap or rotation · one command to open (`npm run situation-room`) and a URL · Hebrew, RTL, readable · tests for the
hook, and CRITIC reviews it like any hook (a change under `.claude/`).

**Starting point** — a draft from another, now-closed session, uncommitted on the working tree:
`.claude/hooks/situation-log.js`, `.claude/hooks/situation-log.test.js`, `tools/situation-room/server.mjs` and
`index.html`, plus wiring in `.claude/settings.json` (PreToolUse/PostToolUse/… on every tool), `package.json`
(`situation-room` script, test wired into `test:tools`) and `.gitignore` (`.live/`). It is already live: `.live/events.jsonl`
exists. It cites a decisions.md entry that does not exist.

**ORCHESTRATOR's review of the draft**
- Good: observe-only (exit 0, uncaughtException → exit 0, nothing printed); Bash logged by description, never command;
  5 MB rotation to `.1`; worktree sessions log to the main checkout; SSE server on 127.0.0.1 only, serving only the
  log and the page.
- **Breaks "no content":** `UserPromptSubmit` logs the prompt text (160 chars) · `SubagentStop` logs the last assistant
  message (240 chars) · `WebFetch` logs the full URL (a query string may carry a token) · `Skill` logs `args` ·
  `UserPromptExpansion` logs `command_args` · a Read/Write of an `.env*` file logs its path.
- **Missing:** guard blocks in real time (the guard writes `incidents.md`; nothing feeds the room) · history summaries
  (per agent/skill usage and duration, per part, CRITIC/TEST ENGINEER rounds per part, blocks over time, timeline with
  merges) · pipeline step and part derived from agent type and branch · tests beyond the basics · a decisions.md entry.
- Watch: the hook runs on every tool call next to the guard — keep it fast; measure it.

**Risk flags** — all false: no product data, no auth, no schema, no money, no new external provider; the server is
loopback-only (127.0.0.1), not an external surface. A change under `.claude/` (hooks, settings) → CRITIC reviews it as
it reviewed the guard.
**Path** — Standard, as tooling: SPEC → BUILDER → CI → TEST ENGINEER + CRITIC. Gate 1 and the Preview: ORCHESTRATOR.
**Sequence** — after UI wave 1 part e is merged, before part f (Afik).
**Next owner** — SPEC.
