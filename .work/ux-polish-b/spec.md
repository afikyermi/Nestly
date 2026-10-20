# ux-polish-b (I3 UX polish, part B) — windows and history, in-place edit, small fixes

**Problem**        Built I3 screens break direction.md "דפוסי אינטראקציה": a confirmation ignores Back and an outside press
(Back can leave the screen with it open); the side menu ignores Back; editing a post from the feed leaves the feed; the post
page shows its author's edit/delete as buttons; with one "⋯" open, another takes two presses; "פיד" pressed with a menu open
leaves a dead Back; the icon-only "חזרה למעלה" has no tooltip; the original quote and share options are drawn by copies.
**Requirements**   direction.md "דפוסי אינטראקציה" + principle 2 (product doc, Afik 11.10/19.10) · NFR-USAB-004
(06-non-functional.md) · FR-FEED-002 own edit/delete (05-functional/feed.md) · FR-PROFILE-002 DR-1, DR-3
(05-functional/profile-settings.md) · FR-REL-001 Remove Friend (05-functional/relationships-groups.md) · CRITIC F3.9 bug 2, low A,
bug-4 e2e (`.work/hide-post/findings.md`); F3.7 items 2, 3 + residual note; F3.5 low 4 · I3-community-feed.md "ליטוש UX" 3b, 3c,
5, 5b–5f, 7, 8, 9. **Not in the SRS (flagged, SRS-changes row 7 at the I3 close):** Back/outside closing, in-place edit, the
author's "⋯" on the post page.
**Scope**          Web only: Back and outside press for every confirmation, sheet and the side menu · one-press switch between
"⋯" menus · same-screen navigation with a menu open · in-place edit on the own feed card · the post page author's "⋯" · the
to-top tooltip · one shared original-quote component and MenuItem in the share-link window.
**Out of scope**   In-card comments (ux-polish-a) · any server, Zod or schema change (F3.1 `PUT`/`DELETE /posts/:id` as built) ·
editing a share or an anonymous post from the feed (feed `isMine` is false there, F3.4 c8) · the edit form's fields, texts and
validation (F3.1/F3.4 as built) · a "discard changes?" prompt · adding or removing any confirmation (c11) · undo toasts · the
composer · menu item sets other than moving the post page's author buttons · Professional-specific UI · other tooltips.
**Data touched**   None.
**Risk flags**     None: web only; no schema, authz, endpoint, provider or external surface → Standard.

**Decided here (unreserved; ORCHESTRATOR confirms at Gate 1)**
- D1 3b: edit **in place** in the card, not a window. direction.md allows both; the post page already edits in place (F3.1) and
  the composer expands in place; a window closes on an outside press and would drop the text.
- D2 item 7: the journeys confirmation stays. FR-PROFILE-002 DR-3 requires it, and after registration "מתכננים" cannot be added
  back ("הוספה או סיום של 'מתכננים' לבדו אינם קיימים") → irreversible. Remove child and end pregnancy: DR-1, no restore.
- D3 item 8: remove-friend keeps its confirmation: the user cannot undo it alone (the other side must accept a new request,
  FR-REL-001). This part reads direction.md "אי אפשר לבטל" that way (ORCHESTRATOR's I3 list, item 8).
- D4 item 9: closed with no work. F3.9 c13 (stay in the feed, card removed, focus) is built and e2e-tested; c5/c11 keep it.
- D5 an outside press on a confirmation = cancel, never the action (I3 list item 5).

**Acceptance criteria** (U unit · E e2e Playwright; desktop = 1024 px, phone = 375 px)
1. 🎨 [U+E] Card edit (supersedes F3.9 c13 "opens /posts/:id"): own named card → "⋯" → "עריכת הפוסט" replaces the card's body
   and action row, in place, with F3.1's edit form (fields, texts, validation unchanged); header and `aria-posinset` stay; URL and
   history length unchanged; focus in the text box. One card edits at a time: opening another closes the first, no request.
2. 🎨 [U+E] Save sends one `PUT /posts/:id` (double press: one). 200 → body, audience and tag updated in place, form gone, feed
   status "הפוסט עודכן", focus on the card's "⋯". "ביטול" → no request, card unchanged, focus on "⋯". Network/5xx → form stays,
   text kept, F3.1's ERR-004 save text. 404 → card removed, "הפוסט אינו זמין", focus as F3.9 c13. Open the post and Back: the
   restored card shows the saved text; `/posts/:id` from the time link opens with no edit form.
3. 🎨 [U+E] Post page (supersedes the visible buttons of F3.1b c18 / F3.4 c12): `isMine` gets the "⋯" "פעולות נוספות לפוסט"
   with "עריכת הפוסט" and "מחיקת הפוסט" (a share: "מחיקת הפוסט" only; an own anonymous post: both); no visible "עריכה" or
   "מחיקה" button remains. Edit opens the existing in-place form; save, cancel and a cancelled delete return focus to "⋯". Delete
   dialog and outcome as built. Others' "⋯" (F3.7) unchanged.
4. 🎨 [U+E] Confirmations (5, 5c): for each dialog in screen.md, Back = cancel: dialog closed, no request, same URL and scroll,
   focus on its opener; the next Back leaves the screen as it would without the dialog. A press on the backdrop = the same cancel,
   never the action. Esc and "ביטול" unchanged.
5. 🎨 [U+E] In flight (5b; F3.9 bug 4): while a confirmation's request is pending, Back, Esc and an outside press leave it open
   and send nothing. Then 500 → the failure shows in the dialog, and the next Back cancels it and stays on the screen; 204 → the
   outcome as built (feed: card removed, stays on /feed) and exactly one Back leaves the screen. e2e on /feed with a delayed 500
   and a delayed 204.
6. 🎨 [U+E] Other windows (5): every sheet (report, share in feed, share link, "שיתוף Nestly") and the side menu close on Back,
   Esc and an outside press, with no request; screen, URL and scroll stay; focus as built (side menu: "פתיחת התפריט"); the next
   Back leaves the screen. A side-menu item that navigates still does, and Back from its target returns to the screen with no menu
   open. A sheet whose send is pending stays open on Back, as c5.
7. 🎨 [E] Same-screen navigation (5b low A): with a card's "⋯" open on /feed, a press on "פיד" in the bottom navigation (phone) or
   the rail (desktop) closes the menu, the URL stays /feed, and one Back reaches the screen before /feed. Regression (F3.9 bug 1):
   another card's time link pressed with a menu open opens on that press; Back returns to /feed at the same scroll.
8. 🎨 [U+E] One press switches (5d): with any "⋯" open, one press on another "⋯" closes the first and opens the second, focus on
   its first item. Feed: card to card. Post page: post to comment, comment to post, comment to comment. Then Back closes it and
   stays; the next Back leaves the screen (F3.7's two-instance path: no dead entry).
9. 🎨 [U+E] Tooltip (5e, NFR-USAB-004): at 1024 px, where "חזרה למעלה" shows its icon only, hover and keyboard focus show the
   tooltip "חזרה למעלה"; the accessible name stays "חזרה למעלה". At 1280 px (text shown) and 375 px: unchanged.
10. 🟡 [U] One component each (5f): the original quote (author or "מהקהילה", audience, time, body; "הפוסט המקורי כבר לא זמין"
    when unavailable) is one shared component used by the feed card, the post page share view and the share-in-feed window
    (static test: one definition, imported by the three, no other `blockquote` in them). The share-link window's options are the
    shared MenuItem; names, roles, order and ≥44×44 px unchanged. Existing tests of the three views pass unchanged.
11. 🟡 [U] Confirmations kept (7, 8, 9): static inventory — the `ConfirmDialog` call sites are exactly screen.md's list (a later
    part adds none: ux-polish-a reuses the comment one). The journeys, remove-friend and post-delete dialogs keep their texts and
    initial focus on "ביטול"; their existing tests pass unchanged.
12. 🎨 [E] axe 0 at 375 px and 1024 px: card in edit, post page "⋯" open (own post, own share), each confirmation, the side menu,
    the tooltip shown; new or moved controls ≥44×44 px, visible focus; RTL; keyboard only.

**Open questions**
- Q1 Back while a card is in edit → **assumed:** leaves the feed as today; the edit is dropped, no request, no prompt (the post
  page's F3.1 edit already behaves so).
- Q2 Esc inside the card's edit form → **assumed:** does nothing new (F3.1's form has no Esc rule); "ביטול" closes it.
- Q3 Item 8 (D3) → **assumed:** an interpretation of direction.md, not a change to it. If ORCHESTRATOR reads it as a change to
  Afik's approved text, it goes to Afik's waiting list; no code depends on the answer (the dialog exists today).
- No DECISION REQUEST: every point is unreserved UX (CLAUDE.md "Decision authority"); none fills an SRS TBD or open OP.

**Size estimate**  ~430 product lines: Back/outside for 6 confirmation sites through one mechanism ~130 · side menu Back ~30 ·
in-card edit ~140 · post page "⋯" ~50 · same-screen nav + one-press switch ~50 · tooltip ~10 · shared quote and MenuItem ~20 net.
One PR. Build **before** ux-polish-a (its comment menus rely on c4–c8); both touch FeedCard/FeedScreen → sequential.
