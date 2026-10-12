# notes — guard notes.md case rule

**Approach**        four edits in `.claude/hooks/guard.js`, in `excludesNotes()` and `checkReader()`.
**Decisions**
- `excludesNotes()`: the pathspec is no longer passed through `fold()`; it is compared as written, as git does.
  `:(icase)` magic is not honoured: an `icase` exclusion is not in the allowed forms, so it stays blocked (the safe side).
- `.work` wildcard check: `/i` on the regex. `cd` check and Grep reach check: `.toLowerCase()` on the already-relative path.
  Local to the `.work` checks, so `fold()`/`rel()` and the TEST ENGINEER rules (app paths) behave as before.
**Deviations**      none.
**Deliberately not done**   no change to `fold()`/`WIN`, no refactor; no `:(icase)` support.
**Uncertain**       the Read-tool path (`isNotes`) and the `notes.md` regex were already case-insensitive; not re-verified beyond the tests.
**Preview path**    none (hook only). Run `node --test .claude/hooks/guard-case.test.js .claude/hooks/guard.test.js`.
**Neighbouring**    none noticed.
