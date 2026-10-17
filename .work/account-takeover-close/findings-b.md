# CRITIC — F2.0 part (b) findings (one round, 16.10.2026)
Saved verbatim by ORCHESTRATOR (the harness refused the subagent's write).

Read: spec.md (c14, c15), interface.md, review.diff, and the unchanged neighbours access.ts, auth-session-source.ts,
services/api/recovery.ts, features/recovery/RecoveryForm.tsx, SRS ERR-042–044. notes.md not read.

no bugs

Notes (not bugs): signIn() does not raise the questions flag for active-must-set-password (no wrong outcome: c9, hold
order, markPasswordSet raises it) · a stale comment in e2e/visual-screens.ts says `menu: true` for `openMenu`.
