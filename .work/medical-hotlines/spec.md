# medical-hotlines (F3.8) — a fixed page of call buttons to MDA and the HMOs' nurse lines

**Problem**        A parent worried about a symptom has no way inside Nestly to reach real medical help; the community may answer
instead (BR-075 rule 2 forbids diagnosing). The SRS promises a hotline page (PG-047) and a menu item; neither exists.
**Requirements**   FR-MENU-002 (05-functional/navigation.md) · AC-109 (15-acceptance.md) · PG-047 (07-screens-navigation.md) ·
FR-MENU-001 (menu order) · §12 "Medical hotlines" (12-external-interfaces.md: `tel:` only, no integration, no data) ·
decision 2026-10-16 "seven open details" (4).
**Scope**          Web only. One protected route with the page (h1, five call links, the disclaimer line); one menu item; one constant list
that is the only home of the names and numbers. No server, no request, no schema.
**Out of scope**   The community rules page (PG-049) and its rule-2 link (see Open Q1) · opening hours beyond Q3, addresses, maps, chat or
WhatsApp lines · any other hotline (poison centre, ERAN, police) · a Guest or signed-out version · detecting the user's HMO or ordering
by it · any record, event, log or analytics of a visit or tap · a desktop call integration (desktop shows the number) · an emergency
shortcut elsewhere (bottom nav, feed, composer) · Professional, Admin, Moderator menus (no such account can sign in yet) · editing the
list in the app (it changes only by a code change).
**Data touched**   none. No table, field, stored media, request or log line.
**Risk flags**     none. No schema, no authz change, no new endpoint; `tel:` is an outbound link with no data (§12). → **Standard**.
**Schema needs**   none.

**Acceptance criteria** (U unit · E e2e)
1. 🟡 [U] Values verified at build. The list holds exactly five entries in this order: MDA (`101`), then כללית, לאומית, מאוחדת, מכבי
   (Hebrew alphabetical; no HMO favoured). Each HMO number is the one its **official** website names as its nurse line on the build
   date; if that site names no nurse line, the HMO's published 24/7 medical or call-centre number from its official site, labelled with
   what it is (DR-1 decided). BUILDER records each source URL and date in `notes.md` and result.md. No number comes from memory, a
   third-party site or a search snippet; no placeholder ships. [FR-MENU-002, AC-109]
2. 🎨 [U] `/medical-hotlines`, signed-in: one `h1` "פנייה למוקד רפואי", inside `main`; five links, each `href` = `tel:` + the entry's
   number exactly (digits, a leading `*` or `+` only; nothing encoded away), each with the service name and the number as visible text,
   so a desktop user can read and dial it. [AC-109, FR-MENU-002]
3. 🎨 [U] The line "לא תחליף לטיפול רפואי. במצב חירום — 101" is visible above the list, verbatim from FR-MENU-002, and not inside a
   link. [AC-109]
4. 🔴 [E] No record or event (AC-109, decision 16.10 (4)): opening the page and activating each of the five links sends **zero** network
   requests (Playwright records every request from page load to the last click; the list is empty); no `onClick`, beacon or analytics
   handler is attached to a link (unit); `localStorage`/`sessionStorage` unchanged. [AC-109]
5. 🎨 [U+E] Menu: an active Regular sees "פנייה למוקד רפואי" between "תנאים ופרטיות" and "שאלות לשחזור סיסמה" (FR-MENU-001 order);
   choosing it closes the drawer, opens `/medical-hotlines`, focus on the `h1`; the item has `aria-current="page"` while there; every other
   F2.5 c1 item and its order unchanged. [FR-MENU-001, FR-MENU-002]
6. 🔴 [U] Guard: the path is protected. Signed-out → Welcome (ERR-012); signed-in active → renders; held `needsQuestions` /
   `mustSetPassword` → redirected exactly as every other protected path; existing `access` tests pass unchanged. [FR-MENU-002 precondition]
7. 🎨 [E] axe 0 violations, RTL, at 360 px and 1280 px; each link ≥ 44×44 px with visible focus; one column, no horizontal scroll;
   numbers render left-to-right (`dir="ltr"` on the number) so a `*NNNN` code does not flip. [NFR-A11Y-001]

**Test seam**      One exported constant array `{id, label, number}` is the only source of names and numbers; the page and every test read
it. c1's test asserts the five ids and their order, and that every number matches `^(\*\d{2,5}|\+?\d{3,12})$`.

**Open questions**
- **DR-1 → decided (ORCHESTRATOR, Gate 1, 19.10):** an HMO whose official site lists no nurse line gets its published 24/7 medical or
  call-centre number from its official site, labelled with what it is (e.g. "<HMO> — מוקד 24/7" instead of screen.md's "מוקד אחיות"
  for that row; the label text follows the official name); source URL and date recorded as c1.
- Q1: PG-049 (community rules) has **no owner feature** in `I3-community-feed.md`; BR-075 rule 2 must link here and FR-MOD-001's report
  window links to PG-049 → **assumed if unanswered:** the part that builds PG-049 adds the rule-2 link to the hotline path;
  F3.8 only exposes the path in `PATHS`. ORCHESTRATOR assigns PG-049 (likely beside F3.7).
- Q2: menu and h1 copy → **assumed:** "פנייה למוקד רפואי" for both (FR-MENU-001/002 wording); recorded at I3 close.
- Q3: opening hours → **assumed if unanswered:** not shown; if an official source states a line is not 24/7, BUILDER notes it and the
  entry's visible text adds the hours as written there (copy, no new decision).

**Size estimate**  ~110 product lines (page ~60, list ~20, path/guard/menu ~15, story/visual ~15). One part.
**Combined PR (Afik: combine remaining I3 parts where sensible):** F3.8 and F3.9 (~380 product lines together) are both small and
touch shared web files only lightly → **one PR**, 7 + 12 = 19 criteria (≤ 20, the Elevated cap). The combined PR runs **Elevated**,
because F3.9 is flagged; F3.8's criteria keep their types. If F3.9 stalls on its schema need, F3.8 ships alone as Standard.
