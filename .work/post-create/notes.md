# notes — post-create F3.1 (a: server, b: web)

**Part a (server)** Shared `POST_BODY_MAX`, Zod `createPostSchema`/`updatePostSchema`; routes `/api/posts[/:id]` → service → repository in
`inIdentityTransaction`; delete = `delete_post(uuid)`. Errors: 400 `invalid`, 422 `body_required|body_too_long`, 403 `not_allowed`, 404
`not_found` (one body for missing/unreadable/not yours), 500 `server_error`. `postFaultReply` maps 23514 only on `posts_body_length_check`.
`postBody` refuses U+0000 as 400. PATCH: any of body/audience/stageTag, at least one; `stageTag:null` clears. No actor pre-check: the DB refuses.
Not done: anonymity, shares, rate limit, edit snapshot of a reported post (DECISION REQUEST default applies). Lint error in TEST ENGINEER's
`posts.db.test.ts:62` is not mine.

**Part b (web)** Routes `/posts/new`, `/posts/:id` (protected by pattern, `postIdOfPath`); `features/posts/` (ComposeScreen, PostScreen,
PostContent, PostForm), `services/api/posts.ts`, new `ui/text-area` (+story, STATES). No anonymous control; `isAnonymous` is never sent.
**Decisions**
- Professional detection: the web had no account type. `usePostingRight` calls GET /api/profile (404 `no_profile` = no parent profile);
  `profile.ts` gained outcome `no-profile`. Button shows only on `allowed`; composer blocks only on `not-allowed` (unknown lets the form open,
  the DB refuses with 403). Cost: the feed page now makes one request.
- Audience memory: key `nestly.post-audience.<userId>`, via `AudienceStorageContext` (App passes `browserStorage`; default none), try/catch,
  written only after a successful post. Read once when the form first draws.
- "הפוסט פורסם"/"הפוסט נמחק" travel in router state, accepted only if equal to the known text (`flashStatus`). One `role=status` per screen;
  in the form it is the counter (speaks at ≤100 left, says "מפרסמים"/"שומרים" while pending).
- Edit sends all three fields (PATCH, strict). Textarea is `dir=rtl` fixed. Copy is BUILDER's (ux-copy-he): name notice "השם שלכם יוצג לכל
  מי שיכול לראות את הפוסט" (Afik 6ב), tag label "תגית (לא חובה)", counter, errors, "הפוסט עודכן".
**Deviations**  none from criteria 14-18.
**Uncertain**  How TEST ENGINEER stubs "Professional": mine is `/api/profile` 404 `{error:'no_profile'}`. Router-state status disappears
only on navigation, so a reload of `/posts/:id` keeps it once.
**Evidence**  typecheck, lint (web), check:budgets, check:stories green; web unit: 7 failures, 2 mine (below), 5 flaky timeouts that also fail
without my tracked changes; full Playwright chrome run: see hand-off.
**Neighbouring**  existing tests assert exact fetch counts after landing on `/feed` (completion.test.tsx c16) and the exact protected-path list
(access-decision.test.ts c6): both need the feed's profile call and `/posts/new` added (TEST ENGINEER's files, not edited).
- Fix (TEST ENGINEER finding): a 403 not_allowed on POST/PATCH/DELETE now shows the action's own ERR-004 failure text (screen.md, c17), not UNAVAILABLE_ACTION_TEXT; that text stays only in the Professional block of /posts/new.
- Lows 1-4 fixed: "הפוסט פורסם"/"הפוסט נמחק" now handed over in memory once (not in history), plus a popstate clear; counter region always mounted; re-validate after 422; Professional view keeps h1/title "כתיבת פוסט".
