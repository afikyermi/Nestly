# CRITIC findings — feed-composer always-open (sonnet, round 1 v2, 19.10.2026) — summary saved by ORCHESTRATOR
0 critical/high/medium, 5 low:
1. feed-state withPage drops a unit published before the first page (card + focus lost; status orphaned); c7 test stops at release(). ORCHESTRATOR: carry the published unit over the first page (dedupe by id); extend the test.
2. FeedComposer onFocus on "פרסום" (idle, blank) reveals options above it, the button moves ~400 px before pointer-up → click lost. Fix: don't move the submit under the pointer / don't engage on submit focus while blank; test the idle first press (F3.1 c14).
3. PostForm aria-describedby={noticeId} dangling in compact mode. Fix: set only when a notice renders.
4. sending ref per instance: leave during send, return, resend → duplicate post; first response wipes the new draft. Fix: in-flight state at module level next to the draft (or clear on send, restore on failure).
5. Hygiene: mis-indented `)}`, stale comments from the button design.
All → BUILDER now (same agent); TEST ENGINEER extends c7 and adds the idle-first-press test. No re-check (lows).
Rebase-conflict review (sonnet, once): both features survive; earlier 5 lows fixed; 1 new low — a send that fails after leaving and returning shows no alert and an empty field until the next remount → debt.md.
