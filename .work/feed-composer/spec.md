# feed-composer (I3) — the composer at the top of the feed, expanding in place

**Problem**        To post, a Regular user must leave the feed for a separate page (`/posts/new`), and after
publishing lands on the post's page, losing her place in the feed. The approved design (direction.md "דפוסי
אינטראקציה", Afik 19.10) asks for a collapsed composer at the top of the feed that expands in place, and a
published post that shows at the top of the feed at once.
**Requirements**   FR-FEED-002 (05-functional/feed.md; "פוסט חדש מופיע בהתאם לכללי החשיפה") · FR-FEED-001 ·
FR-FEED-005 r.1 · OP-033, Afik 1א, 5א, 6ב · direction.md + decisions/2026-10.md 19.10 "UX/UI direction and process" ·
amends F3.1 c14, c17 and F3.2 c13, c19; carries F3.1 c15, c16 and F3.4 c11, c16 over unchanged.
**SRS gap (flagged):** the SRS does not say where the composer sits or how it opens; the source is direction.md.
The rule goes on I3's "שינויים ל-SRS" list (decision 19.10).
**Scope**          Web only: collapsed composer on `/feed`, expanding in place at every width; the F3.1b/F3.4 form
moved into it unchanged; "ביטול"/Esc; unsent text kept in memory; browser leave prompt; new post first in the loaded
feed; `/posts/new` redirect; the test amendments below.
**Out of scope**   Any server, schema, endpoint or response change · a full-screen phone window or dialog · edit or
delete in place, "⋯", comments inside the card (other I3 parts) · keeping the new post first after a new snapshot
(reload, fresh visit to /feed, `restarted`) · drafts in storage or the account · a "kept text" hint on the button ·
"new posts" banner, polling · images (I5) · Professional composer (I11) · a composer on profile/home/group ·
`/posts/:id` and its edit form (unchanged, except it no longer receives "הפוסט פורסם").
**Data touched**   None on the server. Web memory only: the unsent composition (text, audience, tag, toggle), one
browser session, tied to the token's user id, cleared at session end like feed-memory. No new storage key.
**Risk flags**     none (no schema, authz, endpoint, provider, new data store) → **Standard**; 🎨 depth: 1024 + 375,
axe, visual baselines.

**Decisions (unreserved; reasons; Gate 1 may overrule)**
- D1 Collapsed = one `button` "כתיבת פוסט" (existing text; also the empty state's action), not a fake textbox that
  tells a screen reader it can type there.
- D2 In place at every width, no phone window: one component and DOM order, no focus trap or `inert`, no window
  route, the feed stays visible below. direction.md allows a phone window; it does not require one.
- D3 `/posts/new` redirects (history replace) to `/feed` with the composer open: old links and bookmarks keep
  working. The path stays protected and reserved (never read as a post id).
- D4 Collapsing loses nothing, so it asks nothing (direction.md: confirm only what cannot be undone). The composition
  survives collapse and in-app navigation; only reload or closing the tab loses it, and only that gets the leave prompt.
- D5 Back is not captured: an in-place section is part of the page, not a window. A history entry would start a new
  feed snapshot (PUSH) and need two Backs to leave. Back leaves /feed as today; the text is kept (D4).
- D6 Focus: expand → textbox; collapse → the button; success → the new card; failure → the alert (as F3.1b).
- D7 The new card is built in the web app from the 201 answer plus the own full name from the `GET /api/profile`
  answer the posting-right check already holds (no new request). Anonymous: `isMine` false, as every anonymous feed unit.

**Acceptance criteria** (U unit · E e2e; each E at 375 and 1024 unless stated)
1. 🎨 [E] Regular on /feed: between the status region and the list, one `button` "כתיבת פוסט", and no link, textbox,
   checkbox or radio of the composer. Professional, or the right checking/unknown: no button. Empty feed: the button
   is the empty state's single action (F3.2 c19: link → button). axe 0.
2. 🎨 [E] Click, Enter or Space replaces it in place with the form "כתיבת פוסט": textbox, "פרסום אנונימי", audience
   group, tag group, "פרסום", "ביטול", in that order; focus on the textbox. URL stays /feed; no `GET /feed`, no history
   entry; loaded cards stay below, unchanged; no `dialog` role.
3. 🎨 [U+E] F3.1 c15, c16 and F3.4 c11, c16 hold here word for word (audience default and memory, counter, empty and
   too-long messages and focus, "מפרסמים" and one request on a double click, toggle, notices, payloads), proven by the
   amended tests below. A new composition opens with the toggle unchecked.
4. 🎨 [E] "ביטול", or Esc with focus anywhere in the form, collapses it; focus returns to the button; a click outside
   does nothing. Reopening shows the same text, audience, tag and toggle; no confirm dialog. While "מפרסמים", "ביטול"
   and Esc do nothing.
5. 🎨 [E] Text typed, toggle checked; go to a card's `/posts/:id` and Back, or to /profile and back by the nav link:
   the composer is collapsed and expands to the same composition. Storage holds neither the text nor an anonymity
   flag. After sign-out and sign-in (same or another user), or a reload: an empty new composition.
6. 🎨 [E, 1024 only] The browser's `beforeunload` prompt fires on reload or close only while the composition has
   non-blank text (open or collapsed); blank or spaces only, or right after a success: no prompt.
7. 🎨 [E] Named post, "חברים בלבד", a tag, success: one `POST /api/posts`, no `GET /feed` after it, URL /feed. The
   composer collapses and resets (empty, unchecked, the remembered "חברים בלבד", "בלי תגית"). The first card of
   `role=feed` (`aria-posinset` 1, the rest +1): own full name ("מהקהילה" if the profile answer has none), "חברים
   בלבד", the tag, the text, time link to `/posts/:id`, "לייק" and "תגובות" without a count. Visible role=status
   "הפוסט פורסם". Focus on that card.
8. 🎨 [E] Anonymous post, success: as c7, but header "אנונימי", audience "כולם", no name or author data in the card's
   DOM or test ids; the remembered audience unchanged (F3.4 c11).
9. 🎨 [E] The new card stays first when the next page loads (no duplicate if its id arrives). Back from its
   `/posts/:id` restores it first with the scroll; that page shows no "הפוסט פורסם". A new snapshot (reload, nav to
   /feed, `restarted`, first-page retry) shows only the server's order. The status is not repeated after Back or reload.
10. 🎨 [E] 403, 5xx, network, 422 `audience_not_allowed`: the composer stays open, text and choices kept, ERR-004 alert
    "הפרסום לא הצליח. אפשר לנסות שוב" in it with focus; no card added, list and remembered audience unchanged.
11. 🟡 [E] A Regular opening /posts/new ends on /feed, composer open, focus in the textbox; Back does not return to
    /posts/new; a reload shows it collapsed. Guest → login (access-decision unchanged). Professional → the /feed
    placeholder, no form, no "כתיבת פוסט". No page or h1 "כתיבת פוסט" remains (amends F3.1 c14).
12. 🎨 [E] Baselines at 375 and 1024: collapsed, open named, open toggle checked, after success (new card first,
    status); axe 0 in each. Button and "ביטול" ≥ 44×44 px. Reduced motion: nothing animates; else expand ≤ 250 ms.
    Collapsed Tab order: the button, then the cards as F3.2.

**Amended tests (TEST ENGINEER; they open /posts/new or expect landing on /posts/:id)**
- `e2e/posts.spec.ts` 38-61 (c14) and 66-169 (c17, c16) · `e2e/anonymous-post.spec.ts` 58-198 (F3.4 c11, c16).
- `e2e/anonymous-post.visual.spec.ts` 37-50: composer baselines retaken on /feed (update-baselines workflow, Linux).
- `e2e/feed.spec.ts` 66-67 (href), 85-89 (focus start), 287-292 (empty-state link) · `apps/web/tests/
  posts-composer.test.tsx` all (renders ComposeScreen at /posts/new). Story `FeedContent.stories.tsx` 54.
- Unchanged: `apps/web/tests/app/access-decision.test.ts` 15, 44 (/posts/new stays protected).

**Open questions**
- F3.4 c11 "unchecked on every open" → **assumed:** "open" = a new composition; a kept one keeps its toggle.
  Resetting only the toggle under kept text could publish a sensitive text with the name on it.
- Focus after success → **assumed:** the new card (confirms the result). Alternative: the collapsed button.
- The post page's now-dead "הפוסט פורסם" hand-over → **assumed:** BUILDER removes it; "הפוסט עודכן" stays.

**Size estimate**  ~280 product lines (composer moved and extended ~130, feed insert ~40, FeedScreen ~30, unsent
memory + session clear ~30, leave prompt ~15, profile name ~10, redirect ~15, stories ~10) + ~550 test lines,
mostly amendments. **One PR**, Standard.
