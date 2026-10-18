# F3.2b — screen contract
Annex of spec.md c13-20 + Afik 6ב. Copy per ux-copy-he (gender-neutral); spec strings verbatim. Unchanged from F3.1b: "כתיבת פוסט" link, status "בודקים אם אפשר לכתוב פוסט", "הפוסט נמחק", ERR texts, "נסו שוב", "חזרה לפיד". Tag labels = STAGE_LABELS.
## Feed — Route /feed · Title (h1) "הפיד" (F3.1b has "פיד": changed, c13) · Landmarks main (Regular only; Professional keeps the placeholder, no list)
| Control | Role | Accessible name (Hebrew) | Note (state, criterion) |
|---|---|---|---|
| write post | link | כתיבת פוסט | existing, stays above the list (c13). In the empty state: the one action there, not duplicated (c19) |
| status | status | existing feed-status region + "נטענו N פוסטים נוספים" | polite, one message per loaded page, N = cards added after dedup; empty when nothing happened (c18) |
| list | feed | פוסטים בפיד | `role="feed"`, aria-busy="true" only while a page loads; no pagination button, no footer (c14, c18) |
| card | article | אנונימי · or the author name · or חבר/ת בקהילה — via aria-labelledby on the author element | aria-posinset 1..n, aria-setsize="-1"; server order; zero buttons inside (c14, c15). Share card: same pattern |
| author name | text | the full name from author.name; "חבר/ת בקהילה" when name is null | not a link, no avatar (c14) |
| anonymous header | text | אנונימי | ANONYMOUS_AUTHOR_LABEL; no name, avatar, link; no author data in DOM, props or test ids (c16) |
| time | link | the date and time text, `<time datetime>` inside | href /posts/:id; the only link in a card; visible focus (c14) |
| audience | text | כולם · חברים בלבד | c14 |
| stage tag | text | STAGE_LABELS value | absent when stageTag is null (c14) |
| body | paragraph | the post text | plain text, line breaks kept, dir="auto"; `<script>` shown as text (c14) |
| share: sharer text | paragraph | the sharerText | below the header, above the quote (c17) |
| share: original | blockquote | the original's body | contains its header (name, or "אנונימי" if isAnonymous), audience, time; no link, no avatar when anonymous (c17) |
| share: unavailable | text | הפוסט המקורי כבר לא זמין | replaces the quote; no original content; the share stays listed (c17, BR-065) |
| sentinel | none | — | hidden element after the last card, not focusable, no text; triggers the next request (c18) |
| to top | button | חזרה למעלה | only after a long scroll; 44×44 px; moves focus to the h1 (c20) |
**States** loading (first page): skeleton cards, no spinner, no shimmer under prefers-reduced-motion (c19) · more pages: aria-busy on the list, cards in tab order, focus unmoved (c18) · last page (nextCursor null): no request, no text · restarted:true: the list is replaced · back from /posts/:id: loaded cards and scroll restored; reload starts anew (c20)
**Empty** small abstract SVG (aria-hidden), text "עוד אין פוסטים בפיד", one link "כתיבת פוסט" (c19)
**Errors** first page: inline-alert (role=alert) inside the feed, button "נסו שוב", no technical text · later page: loaded cards kept, alert after the last card with "נסו שוב" that re-sends the same cursor (c19)
**Other** axe 0 violations at 375 px; the only request is GET /feed (c13)

**Open (defaults)** 1) alert text: ERR-004 text for loading failure, as in the posts load error, not new copy. 2) Card name: aria-labelledby on the author element. 3) "ניסיון חוזר" is the spec's string; F3.1b uses "נסו שוב" — keep "ניסיון חוזר" per c19.
**Gate 1 (ORCHESTRATOR, 19.10):** approved with spec.md. Retry label = the app's existing "נסו שוב" (repeated texts are referenced; overrides c19 wording). h1 "הפיד" per c13 (F3.1b text and test follow in b). Alert text = ERR-004 loading text.
**Screen challenges (ORCHESTRATOR, 19.10):**
(1) null author name → "מהקהילה" (no slash form; F1.2 c26 gender scan).
(2) role=feed only while cards exist; alerts sit right after the feed element.
(3) alert text → "לא הצלחנו לטעון את הפיד. אפשר לנסות שוב".
(4) N=1 → "נטען פוסט אחד נוסף"; N>1 "נטענו N פוסטים נוספים".
(5) unknown/pending profile check: the feed is requested; a 403 not_allowed shows the placeholder.
