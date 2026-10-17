# Escapes

Every defect found **after** merge, and which gate should have caught it.

This file is the eval. It is the only mechanism authorized to change the operating model.

```
YYYY-MM-DD | <feature> | <what was wrong> | should have been caught by: <gate>
```

Gates: `CI` · `CRITIC` · `TEST ENGINEER` · `DATA ARCHITECT` · `SPEC` · `nobody — genuinely unforeseeable`

---

## How this is read

**Procedure, triggers, budgets and versioning: `.claude/learning.md`.** That file owns the rules;
this one only holds the data.

In short: a pattern is **three or more** occurrences of the same category. A single escape is
information, a pattern is a mandate, and most retros correctly change nothing.
**Do not restructure the model on one bad week.**

Read alongside `noise.md` — this file measures what a gate missed, that one measures what it
invented. Acting on one without the other produces a system that gets stricter forever.

---

2026-10-12 | 7.2 onward (all merges) | merged with the GitHub CI `test` job red on every run; the merge step checked a local `npm run ci` on Windows, never the Actions result | should have been caught by: CI — the gate ran and failed; nobody read it
2026-10-12 | 7.2 hooks (guard) | the notes.md rule for CRITIC depended on case and platform: on Windows an exclusion pathspec in another case (`.WORK/*/notes.md`) passed the guard although git does not honour it; off Windows three `.work` checks compared case-sensitively (`.work/guard-notes-case/bug.md`) | should have been caught by: CRITIC
2026-10-13 | 7.2 hooks (guard) | the protected-file rules (notes.md for CRITIC, app source for TEST ENGINEER) are denylists of spellings: the directory git runs from, pathspec magic and git settings, globs without `.work/` and shell expansion pass; honest TEST ENGINEER CI commands are blocked (`.work/guard-allowlist/bug.md`) | should have been caught by: CRITIC (carried over from PR 6)
2026-10-14 | preview-access (PR 21) | tools/preview-shot-run.test.mjs (findings 3–4 tests) was merged without being added to `test:tools`, so CI never ran it; only ORCHESTRATOR ran it locally. Found during F1.3 CI triage | should have been caught by: ORCHESTRATOR at merge (CI ran green without the file) and CRITIC re-check (looked at tests, not at what CI runs) | fixed in F1.3 (PR 22). The first fix itself dropped a space and silenced db-workflows (34 tests) too — caught by counting per file before the push
2026-10-17 | account-takeover-close (PR 38) | (suspected, being confirmed on the Preview) Supabase's admin password set revokes every session of the user, the caller's included; the S-01 clear then fails at `logout?scope=others` and stays pending (503 on every Google request), and the c10 change answers 503 after changing the password — the server tests used a fake Auth port that kept sessions alive (`.work/account-takeover-close/bug.md`) | should have been caught by: DATA ARCHITECT (Auth side effects of the admin call) and E (no Preview flow for the clear or the change before merge) | being fixed on PR 39
