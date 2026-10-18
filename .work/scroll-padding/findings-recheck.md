# PR 66 — CRITIC re-check of F1 (against 952a66e)

Saved by ORCHESTRATOR from CRITIC's hand-back (its Write was refused). CRITIC read the worktree's debt.md; it did not run the
test; it did not read notes.md.

**F1: FIXED.** Claim narrowed: the line says "not reproducible on /u/:id" at 375 and 1024 — exactly what the test walks — and
no longer claims "any screen whose last control sits at the bottom". Open part kept: "Still open: /profile and /settings (its
hash-reached sections, scroll-mt-20) are not walked", with the cost and the fix (add them to SCREENS with stubs that
scroll). F2 also handled: both mechanisms named (h-dvh with main as the scroller below 1024; `html { scroll-padding-top:
56px }` from 1024); the by-hand TopBar match kept as the separate 2026-10-12 item.

New, both low, optional:
- debt.md:108 unchanged still reads as the unqualified open item; 119 says it "narrows" it (by date) but 108 does not point
  to 119. Does not recreate F1 (108 stays open, the conservative reading). Fix: a pointer on 108, or the date in 119.
- debt.md:119 said "mutation-checked" though only the 375 nav mutation ran (Chrome only); the 1024 `html scroll-padding-top`
  removal was not mutated. Fix: say so.

Next owner: ORCHESTRATOR (optional wording, then merge on green).

## ORCHESTRATOR (18.10.2026)
Second note applied (119: "mutation-checked at 375 only — removing the 1024 html padding was not mutated"). First note: 119
already names the 2026-10-17 line by date; 108 stays as written (history).
