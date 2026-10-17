# findings — F2.5 settings-menu (CRITIC, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: medium
file:     e2e-preview/privacy.flow.ts:59
claim:    the Preview E2E still opens Settings through the profile link "הגדרות פרטיות", which c10 removes; not updated in the diff.
failure:  the first serial test (it registers the user) times out on the missing link → the dependent tests fail → E red, merge blocked.
fix:      reach Settings by the menu or `page.goto('/settings#privacy')`; assert `/\/settings#privacy$/`; update the header comment.
status:   fixed (menu route, `#privacy`) — validated by CRITIC 17.10

## Round 2 — CRITIC on cf6ec44 (AppShell scroll container below 1024), 17.10.2026

--- bug ---
severity: medium
file:     apps/web/src/components/layout/app-shell.tsx:89
claim:    `main` is the scroller in a persistent layout; the scroll offset survives route changes and browser restoration no longer applies.
fix:      reset `main.scrollTop` on a pathname change (not on hash-only changes).
status:   fixed in 4ea7b8a — validated by CRITIC 17.10

--- bug ---
severity: medium
file:     apps/web/src/components/layout/app-shell.tsx:89
claim:    on a direct load focus is on `body`; the document does not scroll and `main` is tabIndex -1, so Space/PageDown/arrows scroll nothing (WCAG 2.1.1).
fix:      make keyboard scrolling work from load without losing the skip link as the first Tab stop.
status:   fixed in 4ea7b8a — validated by CRITIC 17.10

--- bug ---
severity: medium
file:     apps/web/src/components/layout/app-shell.tsx:58
claim:    (prediction) iOS on-screen keyboard over an `h-dvh` frame; `html` scroll-padding no longer applies below 1024.
fix:      `interactive-widget=resizes-content` in the viewport meta; scroll-padding on `main`.
status:   fixed in 4ea7b8a — validated by CRITIC 17.10

--- bug ---
severity: low
file:     apps/web/src/components/layout/app-shell.tsx:58
claim:    printing below 1024 clips to one screen.
fix:      `print:h-auto print:overflow-visible` on the frame and `main`.
status:   fixed in 4ea7b8a — validated by CRITIC 17.10

--- bug ---
severity: low
file:     apps/web/index.html:5
claim:    `interactive-widget=resizes-content` is honoured by Chromium Android only; on iOS Safari the keyboard can still overlay the `h-dvh` frame (prediction, no device).
fix:      none now; check once on a real iOS device.
status:   open, low → debt.md (I2 close records)
