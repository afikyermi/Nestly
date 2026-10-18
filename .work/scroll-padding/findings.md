# CRITIC findings — scroll-padding (PR 66), round 1

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own Write ("subagents must return findings as text").
CRITIC read review.diff, app-shell.tsx, index.css, debt.md 46/108/119, grepped `<nav`/`<header` and scroll-padding; not
notes.md. It did not run the test (no shell): the 60/60 and the mutation check are TEST ENGINEER's claims, not verified.

## Answers
1. Asserts 2.4.11 and can fail — yes. (a) visible area outside both bar boxes; (b) `elementFromPoint` at the centre hits the
   control; the `setContent` self-check flags a control under the top bar and one under the nav and passes a clear one. At
   375 the bars are siblings outside the scroller, so it fails only if that structure regresses; at 1024 the document scrolls
   under a sticky top bar, where the backward Shift+Tab pass exercises `html { scroll-padding-top }` (index.css:10).
2. Exemptions sound — a bar's own controls are skipped only against their own bar and still get (b); the skip link gets
   only (b), proving it is not covered while drawn over the bar.
3. "Wait until stable" — not a clock dependency: 3 stable frames, counted in frames; the 120-frame cap resolves with the
   current measurement (cannot false-pass); scroll is instant (no smooth), so the wait is mostly unneeded (F5).
4. Closing the debt — only partly justified (F1, F2).
5. Flaky patterns — no equality on stop counts, no exact link labels; two fixture-tied thresholds (F4).

## Bug list
- **F1 | medium | debt.md:119 (108 left as is)** — the close is wider than the coverage: the original item says "any screen
  whose last control sits at the bottom"; the test walks only `/u/:id`; `/profile` and `/settings` are not walked, and
  `/settings` has its own anchors (`scroll-mt-20`, SettingsPage.tsx:14, 54), its privacy section reached by hash. Scenario: a
  page-level sticky element or a hash jump to a settings section leaves a focused control under a bar; the debt says "not
  reproducible, guarded", so nobody looks. Fix: add `/profile` and `/settings` to `SCREENS` (stubs and enough content to
  scroll), or narrow the debt line to "/u/:id only" and keep a reduced open item; mark 108 closed by 119 so they don't
  disagree.
- **F2 | low | debt.md:119** — the stated cause is incomplete: below 1024 the protection is `h-dvh` + `main` as scroller;
  from 1024 it is `html { scroll-padding-top: 14 units }` (index.css:10), unnamed in the line; the 56px is still matched to
  the TopBar by hand (open item debt.md:46); a partly covered control passes both checks by design (the SC says "entirely
  hidden"), so a taller bar would go undetected. Scenario: a cleanup removes the `html` padding because "the shell fixed
  it". Fix: name both mechanisms; note debt.md:46 stays open.
- **F3 | low | spec.ts:78, 87** — check (b) uses the bounding-box centre: a multi-line inline link can have its centre in the
  gap between lines; a control wider than the viewport can have its centre off-screen (`elementFromPoint` → null).
  Scenario: a future label wrapping at 375 fails as "covered". Fix: sample a point inside `el.getClientRects()[0]`, clipped
  to the viewport.
- **F4 | low | spec.ts:132-134, 163-164** — `forward.length > 30` and "last control's name contains 'משותף'" depend on the
  fixture. Scenario: a new control after the mutual-friends list, or shorter lists, fails for reasons unrelated to 2.4.11
  (not flaky today). Fix: derive from the fixture (24 + 12 links) or assert only that the last stop is inside `main`.
- **F5 | low | spec.ts:95-105, 167** — `probe` depends on `requestAnimationFrame`: a hidden/throttled page (minimized headed
  run) makes `evaluate` hang to the test timeout instead of failing clearly; the Shift+Tab loop makes exactly
  `forward.length` presses, no slack. Scenario: a browser adding/skipping one stop when focus re-enters fails with a
  misleading "did not come back to the skip link". Fix: loop to `forward.length + 5`, stop on the skip link; explicit message
  on the frame-cap path.
- **F6 | low | spec.ts:183-205** — the self-check covers only full coverage by a bar, not centre-covered-but-area-free (what
  (b) exists for). Scenario: (b) broken to always return true, self-check still passes. Fix: add a button half under the top
  bar with its centre under it, expect a non-empty verdict.
No critical or high; no auth, data access, secrets or open SRS item touched; titles name the verdict, no clock; expected
values trace to SC 2.4.11, not source constants.

## Done · Artifact · Findings · Open · Next owner
Done: reviewed `e2e/focus-not-obscured.spec.ts` and the debt line — a genuine 2.4.11 check that can fail. Findings: 1 medium
(F1), 5 low (F2–F6). Open: which scratch mutation did TEST ENGINEER catch (removal of `html scroll-padding-top` at 1024 should
be caught by the backward pass — not run here); after fixes CRITIC re-checks F1 only. Next owner: BUILDER (F1, F2 debt wording
and screen coverage; F3–F6 optional), then CRITIC re-checks F1.

## ORCHESTRATOR's handling (18.10.2026)
F1: the debt line is narrowed to what is proven ("not reproducible on /u/:id"), and /profile and /settings stay an open item
with the fix named. F2: both mechanisms named, debt line of 2026-10-12 (UI wave 1 part f) stays open. F3–F6: one debt line
(test robustness, low). The mutation TEST ENGINEER ran: the nav made a fixed bar over a full-height `main` at 375 (5 controls
reported covered), Chrome only; the 1024 `html` padding removal was not mutated — named in the open item's context.
