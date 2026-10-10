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

*no entries*
