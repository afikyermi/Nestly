# CRITIC findings — ux-polish-b (sonnet, round 1, 19.10.2026) — summary saved by ORCHESTRATOR
1 low: JourneysSection.tsx save() — the account-unavailable refusal closes the confirm and pops history while the guard redirects (sibling of the fixed 401 race). → BUILDER: keep the dialog for both refusals; copy (ORCHESTRATOR): stopped → ERR-037 text.
Everything else checked clean (confirms/backdrop/pending, side menu entry, same-screen nav, one-press ⋯, card edit, post-page ⋯, tooltip in main, shared quote/MenuItem, tests).
