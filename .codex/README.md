# .codex — Codex's working folder

This folder belongs to **Codex** (OpenAI's coding agent), which works on Nestly between Claude Code sessions under the
same rules (`CLAUDE.md`) and the same records (`WORKPLAN-HE.md`, PR bodies, the SRS, `decisions-in-force.md`).
Codex's entry file is `AGENTS.md` at the repo root; the sync protocol is its §8.

- `adaptations.md` — where Codex had to apply a rule or a `.claude/skills` procedure differently (Claude-only tools
  such as subagents, `/code-review`, scheduled tasks), and why.
- `session-log.md` — one entry per Codex session: what was done, what is half-done and where, notes for Claude.

**Claude Code:** on takeover, read `session-log.md` (latest entries) and `adaptations.md` after WORKPLAN. Don't edit
Codex's entries; raise disagreements with Afik in WORKPLAN "ממתין לך". These files are not product records and not
the SRS.
