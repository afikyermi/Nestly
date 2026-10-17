# F2.5 — Settings and side-menu destinations (settings-menu)

**Problem**        A signed-in Regular parent opens the menu and finds one "הגדרות" item that leads to a placeholder
                   (`AppRoutes.tsx:37`), and after F2.3 a privacy screen reachable only from a temporary link on the profile page.
                   The SRS promises a central Settings page and a menu with named destinations; today the parent cannot tell
                   where their account, privacy, security and legal documents are, and a signed-in user who opens `/terms`
                   is sent to the feed (`access.ts:35`: a Guest path), so the consent documents cannot be read after sign-up.
**Requirements**   FR-SET-001 (05-functional/profile-settings.md) · FR-MENU-001 (05-functional/navigation.md) · PG-038
                   (07-screens-navigation.md) · FR-SET-002 for the exclusion only · FR-AUTH-004 (route guard) · AC-005 (bottom nav
                   has no disabled items). The SRS has no AC for either FR; every criterion below traces to the FR text or is
                   marked "(not in SRS)". Review points A9, S3. Decided: account deletion is not shown until I9 (U1).
**Scope**          Regular account only. (1) SettingsPage (F2.3's route `PATHS.settings`) gets its sections: Account,
                   Privacy & Security (F2.3's, unchanged), Terms & Privacy (DR-2). (2) The menu replaces the single "הגדרות" item
                   with one item per live section; "שאלות לשחזור סיסמה", "החלפת סיסמה" and "התנתקות" stay. (3) Unbuilt
                   destinations are absent (DR-1). (4) The route guard lets an active signed-in user open `/terms` and `/privacy`.
                   (5) The temporary profile-page link F2.3 added is removed. Web only; no server, no schema.
**Out of scope**   Notification Settings and `FR-NOTIF-002` (I7) · My Groups (I10) · Following Professionals (I11) · Help/Support
                   Request (I8) · community rules page (PG-049) and medical hotlines (PG-047, FR-MENU-002) · account deletion,
                   PG-050 and the "מחיקת חשבון" control (I9) · the text of the Terms and Privacy documents (I9) · email display
                   or change · Professional, Admin and Moderator menus (no such account can exist) · the Friends page and its
                   menu item (F2.4 adds its own; see Q3) · a Settings search, a theme or language setting · analytics events.
**Data touched**   none. No table, field or stored media. The Settings page sends no request of its own; the Privacy section keeps
                   F2.3's `GET`/`PUT /api/privacy`.
**Risk flags**     none. The guard change (c6) is access control but adds no authentication, no authorization rule and no new
                   surface: two public placeholder pages already served to Guests. CRITIC still checks the guard (c6 is 🔴). → **Standard**.

**Acceptance criteria**
1. 🎨 Active Regular, I2 state, opens the drawer: items in this order: "חשבון", "פרטיות ואבטחה", "תנאים ופרטיות" (if DR-2 → A),
   "שאלות לשחזור סיסמה", "החלפת סיסמה", "התנתקות". The drawer holds no item named קבוצות, עוקבים/מקצועיים במעקב, התראות, עזרה,
   כללי הקהילה, מוקד רפואי or מחיקת חשבון, and none of בית, פיד, פרופיל (FR-MENU-001: no duplicate of the bottom nav).
   [FR-MENU-001, DR-1, Q1] Screens: `side-menu-open`.
2. 🎨 Choosing "חשבון", "פרטיות ואבטחה" or "תנאים ופרטיות" closes the drawer, shows `PATHS.settings` with that section's `h2`
   visible and focused, and the address differs per section (Q2). Reloading that address shows the same section; back returns to
   the previous screen. An unknown section in the address shows the top of Settings, no error. [FR-SET-001 "Section המתאים"]
3. 🟡 The other menu items keep their destinations: recovery questions → `PATHS.recoveryQuestions`, change password →
   `PATHS.changePassword`, "התנתקות" ends the session on this device and lands on Welcome. A click on the item for the screen
   already open replaces the history entry, as built. [FR-MENU-001, FR-AUTH-003]
4. 🎨 SettingsPage: one `h1` "הגדרות" and one `h2` per section, in DOM order Account, Privacy & Security, Terms & Privacy. Account
   holds one link "עריכת פרופיל" to `PATHS.profile` and nothing else (DR-3). Privacy & Security holds F2.3's form unchanged, plus
   links to `PATHS.recoveryQuestions` and `PATHS.changePassword` (DR-3). [FR-SET-001, PG-038] Screens: `settings`.
5. 🔴 Nothing on Settings, in the menu, or in the page source offers account deletion: no text matching מחיקת חשבון/מחיקה, no
   control calling a delete route. No Notification Settings section or heading exists. [U1 decided; DR-1]
6. 🔴 Guard (`decideAccess`), signed-in active: `/terms` and `/privacy` render. `/`, `/login`, `/register`, `/recovery`,
   `/auth/google` still redirect to `/feed`. With `needsQuestions` or `mustSetPassword` held, `/terms` and `/privacy` render as
   before and every other path redirects as before. Signed-out: `/settings` → Welcome; session ended → login. `/settings/x` and
   `/settings/` are normalised as the router does. Existing `access` tests pass unchanged. [FR-AUTH-004, ERR-012]
7. 🎨 (blocked on DR-2) "תנאים ופרטיות" shows two links, "תנאי השימוש" → `PATHS.terms` and "מדיניות הפרטיות" → `PATHS.privacy`, in
   the same tab, and each page has a way back to Settings. The pages show what they show today (I9 placeholders); this part
   writes no document text. [FR-SET-001, F1.4]
8. 🔴 Opening Settings makes no request except F2.3's privacy `GET`. A test records the calls on `/settings` in every section and
   asserts that list. A suspended or banned account never renders Settings: the existing ERR-037 path, as `/profile`. [A9, FR-AUTH-004]
9. 🎨 F2.3's privacy `GET` failing or pending affects only the Privacy section (its own loading and error states from F2.3 c4).
   Account and Terms & Privacy stay visible and usable, and the menu works. [ERR-004]
10. 🎨 The temporary link to the privacy screen on the profile page is gone; no other screen links to a privacy route that no
    longer exists. The profile page's F2.1 tests pass. (not in SRS: closes F2.3 Gate 1 DR-2)
11. 🎨 Keyboard only: Enter or Space on the Hamburger opens the drawer and focus lands in it; Tab and Shift+Tab stay inside; Esc
    closes it and focus returns to the Hamburger; Enter on an item navigates (c2). After navigation focus is on the destination
    heading, not on `body` or the Hamburger. The current section's item has `aria-current="page"`. [NFR-A11Y-001, S3]
12. 🎨 `side-menu-open` and `settings` (each section in view) have zero axe-core violations, in RTL, at phone (360 px) and desktop
    (1280 px). The drawer opens from the right edge. Settings is one column with no horizontal scroll at both widths. [S3, NFR-A11Y-001]

**Screens for `e2e/visual-screens.ts`**: `side-menu-open`, `settings` (an `app` entry; Privacy states are F2.3's).

**Open questions**
- **DR-1 (ORCHESTRATOR; spec gap: FR-MENU-001 lists destinations, not what to show before they exist)** — how a destination
  whose feature belongs to a later Initiative appears. **A (recommended): absent, not disabled.** The as-built bottom nav
  already does this ("חנות" and "יועצים" absent, `ProtectedLayout.tsx:9`, AC-005); a disabled item is a promise with no date, a
  dead tab stop, and an extra axe case. Each later feature adds its own item when it ships. B: shown, disabled, "בקרוב" (a
  visible roadmap, but 7 inert items and copy the SRS does not hold). C: shown, opens a placeholder page (the user lands nowhere).
  Live in I2: Account, Privacy & Security (F2.3), recovery questions (F1.6), change password (F2.0), Logout, Friends (F2.4), and
  Terms & Privacy links (DR-2). Not live: My Groups (I10), Following Professionals (I11), Notification Settings (I7), Help/Support
  (I8), community rules, medical hotlines (I3, FR-MENU-002), account deletion (I9). The Initiative that owns community rules is
  not named in the plan I read; either way it is not I2.
- **DR-2 — RESERVED for Afik (legal: terms of use and privacy)** — whether the signed-in app shows "תנאים ופרטיות" now, when the
  documents are placeholders until I9. **A (recommended):** show the section; the links already exist at registration (F1.4), and a
  consent document a user cannot reopen after signing is the worse state. B: hide until I9 writes the texts. Until answered,
  c1's third item and c7 are not built; c2, c4, c6 (the `/terms` rule is built, it is harmless), c8 onward proceed.
- **DR-3 (ORCHESTRATOR; spec gap: FR-SET-001 names "Account" and "Privacy & Security" but lists no contents)** — A (recommended):
  Account = a link to edit the profile (deletion joins in I9); Privacy & Security = F2.3's form plus the two security links
  (recovery questions, change password), since FR-AUTH-003 and S-16 are security. B: the two security links under Account. C: Account
  also shows the email read-only (F2.1 DR-1 rejected it; email change is out of I2).
- Q1: menu and section labels ("חשבון", "פרטיות ואבטחה", "תנאים ופרטיות", "עריכת פרופיל") are not in the SRS → **assumed if
  unanswered:** as written; record at I2's close.
- Q2: the address of a section → **assumed if unanswered:** `/settings#account|privacy|terms` (hash, so `PROTECTED_PATHS` is unchanged);
  BUILDER may choose otherwise and records it in notes.md.
- Q3: who adds the Friends menu item → **assumed if unanswered:** F2.4 adds it with its page, whichever of F2.4 and F2.5 merges
  second keeps both items; c1 is then asserted without it if F2.4 has not merged.
- No other reserved item. Account deletion needs no question (decided).

**Size estimate**  ~230 lines without tests: menu rewrite ~50, SettingsPage and three sections ~110, section/hash focus ~30,
`access.ts` and `paths` ~15, profile-page link removal ~10, story/visual entries ~15. Fits in one part. No split.

## Gate 1 — ORCHESTRATOR, 17.10.2026

Approved, 12 criteria, one part, **Standard** (no schema, server or new surface); c6 is a route-guard change, so CRITIC checks
it. **DR-1 → A** (later-Initiative destinations are absent, as the bottom nav does under AC-005) · **DR-3 → A** (Account = an
"edit profile" link; Privacy & Security = F2.3's form plus the recovery-questions and change-password links). Q1–Q3 take their
defaults. Reason: SPEC's recommendations; no promise without a date, no new screens beyond what exists.
**DR-2 is reserved** (legal: "תנאים ופרטיות" in the signed-in app while the documents are I9 placeholders) → WORKPLAN
"ממתין לך". Until answered, the Terms & Privacy item, c6 and c7 are not built; everything else proceeds.
Code waits for F2.3 on the branch.

**Afik, 17.10.2026 (decisions.md 2026-10-17 "I2 reserved items"):** DR-2 → A (show "תנאים ופרטיות" in the signed-in app). c6, c7 and the item are in scope.

## Gate 1 clarifications — ORCHESTRATOR, 17.10.2026, at build start
- **Q3 resolved by order of merge:** F2.4b merged first (PR 48) with "חברים" first in the drawer (FR-MENU-001 lists Friends before
  Settings). F2.5 keeps it: c1's order becomes "חברים", "חשבון", "פרטיות ואבטחה", "תנאים ופרטיות", "שאלות לשחזור סיסמה", "החלפת
  סיסמה", "התנתקות". Every other c1 assertion stands.
- **DR-2 → A** (Afik, 17.10.2026, decisions/2026-10.md "I2 reserved items"): "תנאים ופרטיות" is shown; c7 is unblocked.
