# CRITIC findings — ux-polish-a (opus, round 1, 19.10.2026) — summary saved by ORCHESTRATOR
medium 1 — feed-scroll.ts:33-39: restores a captured scrollRestoration that is 'manual' after the first Back; entries inherit manual → desktop Back/Forward scroll regresses app-wide. → BUILDER.
medium 2 — CardComments.tsx: in-card "שליחה" is filled primary in every card (design-system 5 / one primary action). → BUILDER (non-primary variant in the card).
low 3 — c11 test races the confirm's overlay pop (root: useBackCloses navigate(-1) after an item-close vs immediate navigation, from ux-polish-b) → TE fixes the test; product race → debt.md.
low 4 — no-field cases: "השבה" stores a hidden reply draft; "תגובות" does nothing → BUILDER.
low 5 — c11 doesn't assert hidden/reported cards stay absent → TE.
