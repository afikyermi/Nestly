# feed-composer (I3) — the composer field, always open at the top of the feed

**Amendment 19.10 (Afik item 15; decisions/2026-10.md "Composer and Professional posting"):** no "כתיבת פוסט"
button, no collapsed state; the field is always open. D1, D2, D4, D5 and c1, c2, c4, c5, c11, c12 are rewritten (the
Gate 1 text is in git history). The Professional composer is `.work/professional-posting/`.

**Problem**        To post, a Regular user must leave the feed for `/posts/new` and then lands on the post's page,
losing her place. direction.md "כתיבה" row (Afik 19.10): a field always open at the top of the feed, no button;
a published post first in the feed at once.
**Requirements**   FR-FEED-002 (05-functional/feed.md) · FR-FEED-001 · FR-FEED-005 r.1 · OP-033, Afik 1א, 5א, 6ב ·
direction.md + decisions/2026-10.md 19.10 · amends F3.1 c14, c17, F3.2 c13, c19; carries F3.1 c15, c16, F3.4 c11, c16.
**SRS gap (flagged):** the SRS does not place the composer; source direction.md → I3 "שינויים ל-SRS".
**Scope**          Web only: the F3.1b/F3.4 form always on `/feed`, options revealed in place; unsent text kept in
memory; leave prompt; new post first in the loaded feed; `/posts/new` redirect; test amendments.
**Out of scope**   Server, schema, endpoint or response changes · a window, dialog or button to open the composer ·
"ביטול" or a clear-text action · edit/delete in place, "⋯", comments in the card · keeping the new post first after a
new snapshot · drafts in storage · "new posts" banner · images · Professional composer (`professional-posting`) ·
a composer elsewhere · `/posts/:id` and its edit form (unchanged, except no "הפוסט פורסם" there).
**Data touched**   None on the server. Web memory only: the unsent composition (text, audience, tag, toggle), one
session, tied to the token's user id, cleared at session end like feed-memory. No new storage key.
**Risk flags**     none → **Standard**; 🎨 depth: 1024 + 375, axe, visual baselines.

**Decisions (unreserved; reasons; Gate 1 may overrule)**
- D1 The form "כתיבת פוסט" has one fixed place, after the status region, before the list or the empty state. It
  never moves or remounts when the feed's phase changes (also closes CRITIC low 2).
- D2 Idle = textbox + "פרסום". Toggle, notice, audience and tag appear in place after the textbox while focus is in
  the form or the text is non-blank. Reason: the full form is ~600 px at 375 ("שקט לפני עומס"); typing needs focus,
  so the name notice is always seen before a send.
- D3 `/posts/new` → history replace to `/feed`, focus in the textbox; the path stays protected and reserved.
- D4 No "ביטול", no Esc action: with nothing to close, cancel could only clear the text, which cannot be undone and
  would need a confirmation; text is erased by hand. The composition survives in-app navigation; only reload or
  closing the tab loses it, so only that gets the browser's leave prompt.
- D5 Back is not captured; it leaves /feed as today; the text is kept (D4).
- D6 Focus: /posts/new → textbox; success → the new card; failure → the alert (as F3.1b).
- D7 The new card is built from the 201 answer plus the own full name the posting-right check's `GET /api/profile`
  already holds (no new request). Anonymous: `isMine` false, as every anonymous unit.

**Acceptance criteria** (U unit · E e2e; each E at 375 and 1024 unless stated)
1. 🎨 [E] Regular on /feed, idle: form "כתיבת פוסט" between the status region and the list holding only textbox
   "מה תרצו לשתף?" and "פרסום"; no button or link "כתיבת פוסט", no checkbox or radio. Professional, or the right
   checking/unknown: no form. Empty feed: the form, same place, is the only action (F3.2 c19 amended). axe 0.
2. 🎨 [E] Focus into the textbox (click or Tab): toggle, notice, audience and tag appear after it in F3.4 order, then
   "פרסום". URL, requests, history and cards unchanged; no `dialog`. They stay while focus is in the form or the text
   is non-blank; focus leaving with blank text hides them; the form keeps its place.
3. 🎨 [U+E] F3.1 c15, c16 and F3.4 c11, c16 hold here word for word (audience default and memory, counter, messages
   and focus, "מפרסמים" and one request on a double click, toggle, notices, payloads), proven by the amended tests.
   A new composition starts unchecked.
4. 🎨 [E] No "ביטול" in the form. Esc in any of its controls changes nothing (text, choices, focus). No confirm dialog.
5. 🎨 [E] Text typed, toggle checked; to a card's `/posts/:id` and Back, or to /profile and back by the nav link: the
   field shows the same text and, on focus, the same choices. Storage holds neither text nor an anonymity flag. After
   sign-out and sign-in (same or another user), or a reload: empty, unchecked.
6. 🎨 [E, 1024 only] The browser's `beforeunload` prompt fires on reload or close only while the text is non-blank;
   blank, spaces only, or right after a success: no prompt.
7. 🎨 [E] Named post, "חברים בלבד", a tag, success: one `POST /api/posts`, no `GET /feed` after it, URL /feed. The form
   resets (empty, unchecked, remembered "חברים בלבד", "בלי תגית") and goes idle. First card of `role=feed`
   (`aria-posinset` 1, rest +1): own full name ("מהקהילה" if none), "חברים בלבד", the tag, the text, time link to
   `/posts/:id`, "לייק" and "תגובות" without a count. Visible role=status "הפוסט פורסם". Focus on that card, also
   when sent before the first page arrived (the card shows above the list).
8. 🎨 [E] Anonymous post, success: as c7, but header "אנונימי", audience "כולם", no name or author data in the card's
   DOM or test ids; the remembered audience unchanged (F3.4 c11).
9. 🎨 [E] The new card stays first when the next page loads (no duplicate if its id arrives). Back from its
   `/posts/:id` restores it first with the scroll; that page shows no "הפוסט פורסם". A new snapshot (reload, nav to
   /feed, `restarted`, first-page retry) shows only the server's order. The status is not repeated after Back or reload.
10. 🎨 [E] 403, 5xx, network, 422 `audience_not_allowed`: text and choices kept, options visible, ERR-004 alert
    "הפרסום לא הצליח. אפשר לנסות שוב" in the form with focus; no card added; list and remembered audience unchanged.
11. 🟡 [E] A Regular opening /posts/new ends on /feed, focus in the textbox (options shown); Back does not return to
    /posts/new; a reload shows the idle form. Guest → login (access-decision unchanged). Professional → /feed
    placeholder, no form. No page or h1 "כתיבת פוסט" remains (amends F3.1 c14).
12. 🎨 [E] Baselines at 375 and 1024: idle, engaged named, engaged toggle checked, after success; axe 0 in each.
    "פרסום" ≥ 44×44 px. Reduced motion: nothing animates; else the reveal ≤ 250 ms. Idle Tab order: textbox,
    "פרסום", then the cards as F3.2.

**Tests that change with this amendment (TEST ENGINEER; worktree lines)**
- `e2e/support/composer.ts` 25 `writeButton`, 31 `cancelButton` (remove), 39-42 `openComposer` (focus the textbox);
  callers follow the helper: `e2e/posts.spec.ts`, `e2e/anonymous-post.spec.ts`, `e2e/anonymous-post.visual.spec.ts`.
- `e2e/feed-composer.spec.ts`: c1 63-114, c2 116-154 rewritten; c4 156-244 replaced; c5 246-315 (return shows the
  text); c6 332-371 ("open or collapsed"); c11 474-512 (reload → idle); c12 514-560 ("ביטול" size, motion → reveal).
- `e2e/feed-composer.visual.spec.ts` 26-33: "collapsed" → idle baseline; engaged baselines added.
- `e2e/feed.spec.ts` 66-68, 90 (button → textbox), 293-294 (empty state has no action; the form above).
- `apps/web/tests/posts-composer.test.tsx` 61-78 (open-by-click helper, `collapsed()`) and its uses at 108, 142, 254,
  263, 300, 315, 327, 345, 357.
- Unchanged: `apps/web/tests/app/access-decision.test.ts` 15, 44 · `e2e/posts.spec.ts` 51, 55.

**Open questions**
- D2 reveal → **assumed** as written. Alternative: the whole form always shown (~600 px at 375 before any post).
- F3.4 c11 "unchecked on every open" → **assumed:** a new composition starts unchecked; a kept one keeps its toggle.
- Focus after success → **assumed:** the new card. The post page's dead "הפוסט פורסם" hand-over → BUILDER removes it.

**Size estimate**  Amendment on the built branch: ~60 product lines (remove button, collapse, "ביטול", Esc; add the
reveal and one fixed place) + ~250 test lines amended. Still **one PR**, Standard.
