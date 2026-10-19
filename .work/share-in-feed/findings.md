# CRITIC findings — F3.5+F3.6 sharing (opus, round 1, 19.10.2026) — summary saved by ORCHESTRATOR
Diff covered in one round (~5,150 lines, 70 files) — Afik's single-PR condition holds.
medium 1 — shares-service.ts:489-498: insert and 201 read-back in separate transactions; read-back failure after commit → error shown, retry duplicates the share; db test c3 can flake. → BUILDER (same tx).
medium 2 — use-share-in-feed.ts:813 quoteOf: post-page share window quotes named posts as "מהקהילה". → ORCHESTRATOR: omit the name line when unknown (no contract change).
low 3 — app-shell.tsx:135: fixed back-to-top may overlap the column at 1024. → BUILDER now.
low 4 — share-sheet options copy MenuItem; quote block drawn three times (design-system item 4). → I3 polish.
