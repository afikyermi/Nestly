# result — I2 F2.5 settings-menu: Settings sections and side-menu destinations (PR 52)

**Execution:** Succeeded · **Quality:** Acceptable — merged PR 52 (17.10.2026). CRITIC round 1: one medium (the Preview flow
used the removed profile link) — fixed and validated. At 375 px the sticky bottom bar covered the add-pregnancy button (axe
target-size) → AppShell below 1024 is one screen high and `main` scrolls inside it (ORCHESTRATOR, internal HOW). CRITIC round 2 on
that change: three medium (scroll offset kept across routes, no keyboard scroll from `body`, iOS keyboard/scroll-padding) and one low
(print) — all fixed in 4ea7b8a and validated by CRITIC; one new low (iOS ignores `interactive-widget`) → debt.
**SRS trace:** FR-SET-001 (sections Account, Privacy & Security, Terms & Privacy; DR-3 A), FR-MENU-001 (live destinations only,
DR-1 A; "חברים" first, then the sections), PG-038, FR-AUTH-004 (signed-in `/terms`, `/privacy`), AC-005 (no disabled items). For the
SRS at I2 close: the labels (Q1), the section address `/settings#account|privacy|terms` (Q2), DR-2 A (Afik), the AppShell scroll
container below 1024.
**Evidence:** CI (browser chrome 1/2/3, test, typecheck, lint, build, audit, storybook) and preview-e2e green on `f11a3b2`; visual
baselines reviewed image by image (8d66f8e; update-baselines 39052257222 on cf6ec44: all 80 identical); keyboard scroll verified
in Chromium (notes.md). No migration.
**Lessons:** a layout change that moves the scroller touches focus, scroll restoration, keyboard scrolling and print — review it as
an a11y change, not a one-line fix.
**Still open:** iOS on-screen keyboard over the `h-dvh` frame — check once on a real device (debt).
