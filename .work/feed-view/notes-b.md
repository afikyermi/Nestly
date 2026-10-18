# notes-b — F3.2b feed page (web)

**Approach**  GET /api/feed via `services/api/feed.ts` (shared `feedPageResponse`, outcomes like posts). Flow in `features/posts/use-feed.ts`
(one request at a time, retry re-sends the same cursor, dedupe by unit id in `feed-state.ts`). `FeedContent` draws skeleton / `role=feed`
cards / empty / errors; `FeedCard` draws post, anonymous, share. `FeedScreen` composes h1 "הפיד", the one status region, composer link,
sentinel (`use-sentinel.ts`, IntersectionObserver), "חזרה למעלה" (`feed-scroll.ts`). `ANONYMOUS_AUTHOR_LABEL` added to shared.
**Decisions**
- Feed files live in `features/posts/`: the lint rule forbids feature-to-feature imports and the screen needs the posts texts/status.
- The feed is requested unless the posting check says Professional (placeholder, no request); an unanswered check still requests,
  the server decides (403 not_allowed -> placeholder).
- Back (POP) restores cards + scroll from module memory, only for the same user id; push, reload or another user starts anew.
- Cards are tab stops (tabIndex 0) for feed-mode navigation. Equal consecutive "נטענו N" texts alternate a trailing nbsp to be spoken.
- Retry button stays and shows `pending`; after a successful retry focus goes to the first card it brought.
- `check-stories` STATES: shared/illustrations 2 -> 3 (new `EmptyFeedIllustration`, small nest).
**Deviations**  screen.md: `role=feed` only while cards exist and the error alerts sit right after it, not inside (axe aria-required-children). Alert text = posts LOAD_FAILED_TEXT ("...את הפוסט", singular: screen.md default 1).
**Deliberately not done**  anonymous-original branch (shared schema types `original.isAnonymous` as literal false); singular "נטען פוסט
נוסף" (contract text verbatim for N=1); tests.
**Uncertain**  Restore timing (rAF after the shell's scroll reset) and the 1500 px "long scroll" threshold are untested in a real
browser beyond the e2e run. IntersectionObserver root = `main` when it scrolls (below 1024), else the viewport.
**Evidence**  typecheck, eslint, check:budgets, check:stories green; Playwright chrome: a11y/touch/keyboard/motion/posts green; full run red only on old-feed pins (h1 "פיד", placeholder, no /api on /feed) and Windows visual baselines. Web unit: red only where existing tests pin the old h1 "פיד"
(session-guard-app) and the slash scan below; TEST ENGINEER owns those tests.
**Neighbouring**  none.
**Conflicts to resolve (not mine to edit)**
- screen.md/spec c14 string "חבר/ת בקהילה" trips `tests/app/source-scans.test.ts` (F1.2 c26, no slash gender form). Needs an agreed
  exception in that scan or a neutral string (e.g. "חבר או חברה בקהילה"); implemented as the contract says.
- session-guard-app tests (and e2e posts.spec) find the h1 "פיד" exactly; the h1 is now "הפיד".
