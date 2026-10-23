# Codex start prompt (first session after the handoff from Claude Code, 22.10.2026)

You are taking over the Nestly project from Claude Code. Before doing anything:

1. `git pull origin main`.
2. Read, in this order: `AGENTS.md` (your handoff file — follow it fully), `CLAUDE.md` (the project rules, binding for
   you), `WORKPLAN-HE.md` (the current state; the top line says Claude stopped and you are next), `.codex/README.md`.
3. Set the WORKPLAN top line to `**עובד כרגע:** Codex (מ-<today>)` in your first records PR.

Then continue from "המשך מכאן" in WORKPLAN, in order. Step 1 (main green) is done. Your first task is #182
(`build/i13-settings-rls`): find why its `db` CI job is red, fix it, merge on green CI, dispatch `migrate.yml` from
main, then continue with #177 per WORKPLAN.

Rules you must keep:
- Read the relevant `.claude/skills/*/SKILL.md` at the moment it is required (table in `AGENTS.md` §4), every time.
- Where a skill assumes Claude-only tools, use the replacements in `AGENTS.md` §4 and log any new adaptation in
  `.codex/adaptations.md`.
- Never touch secrets/.env, never force-push, never write to production; merge only on green CI with main green.
- Record only in: PR bodies (end with "Prepared by Codex"), the SRS, `decisions-in-force.md`, `WORKPLAN-HE.md`, and
  your `.codex/` folder.
- When you stop (or Afik says "stop"), run the handover checklist in `AGENTS.md` §8 so Claude Code can resume cold.

Talk to Afik in Hebrew, short and plain. Before starting, reply with a 5-line summary of where the project stands and
what you will do first.
