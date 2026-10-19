# CRITIC findings — hide-restore bug fix (sonnet, round 1, 19.10.2026) — summary saved by ORCHESTRATOR
No critical/high/medium. low 1 — use-back-closes.ts: stepping not released when the menu reopens before the step-back lands → a later outside link press is swallowed. → BUILDER (reset in push()).
low 2 — no unit test for holdLinksWhileClosing exclusions; inAppLink duplicates outside-press checks; PostScreen/CommentsSection still race (out of bug scope) → debt.md.
