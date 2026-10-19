# result — bug: Back restored the hide placeholder (F3.9 c10)
**Root cause:** a link opened while the menu's history step-back (navigate(-1)) was in flight was pushed then undone by the traversal; the feed never unmounted and Back showed its in-memory placeholder.
**Fix:** use-back-closes reports `closing()` during the step-back; the feed holds a plain in-app link click and replays it via followAfterClose once it lands; push() resets the flag (CRITIC low 1).
**Execution:** Succeeded · **Quality:** Good. **Path:** bug-fix · failing test = the quarantined c10 · CRITIC sonnet 2 low (1 fixed, 1 → debt).
**Evidence (local):** c10 20/20 at 1 worker (was 12/20 failing), 10/10 at 4; hide-post 32/32.
**Escape:** escapes.md (10× rule for time-dependent tests).
