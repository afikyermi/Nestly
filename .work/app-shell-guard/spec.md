# F1.2 — app-shell-guard: Welcome, AppShell, RouteGuard

**Gate 1 passed** 14.10.2026, ORCHESTRATOR (working rules; Afik 13.10: from F1.2 no spec is sent to him). DR-1: a signed-in user on an unknown path is redirected to `/feed` — the landing screen after sign-in (FR-AUTH-002); no new copy or screen; SRS note in step 14 (FR-AUTH-004 / navigation). Q1–Q8 take their stated defaults. `decisions/2026-10.md`, "F1.2 Gate 1".

**Problem**  The web app has no product screen. A visitor sees no Welcome, a signed-in user has no shell to land in,
and nothing in the web app keeps a Guest out of protected screens.

**Requirements**  FR-AUTH-001, FR-AUTH-004 (`05-functional/auth.md`) · FR-AUTH-005, the Welcome action only ·
FR-TOP-001, FR-MENU-001 (`05-functional/navigation.md`) · AC-001, AC-005, AC-016, AC-033 (part), AC-087 (part)
(`15-acceptance.md`) · ERR-012 (`10-errors-edge-cases.md`) · PG-001, Global AppShell, Global Routing
(`07-screens-navigation.md` §7.1 and §7.3, `17-traceability.md`) · NFR-A11Y-001 · NFR-USAB-003 · I1 Addendum 1.
Design: `docs/design/direction.md`, R2 (`r2-screens.html` Welcome and Feed shell, `r2-desktop.html` rail), and the UI wave 1
components (AppShell, TopBar, BottomNavigation, SideDrawer, MenuItem, AuthLayout, Logo, WelcomeIllustration, Button,
icons).

**Scope**
- **Welcome** at `/`, with its three actions.
- **Routes and placeholders.** Guest placeholders: Login (F1.5), Registration (F1.3) and the Google entry (F1.8).
  Protected placeholders: Home, Feed, Profile (AC-005) and Settings.
- **The AppShell, composed.** TopBar with the Hamburger and the Logo, bottom navigation with three destinations, and
  the side menu with two items: Settings and Logout.
- **The RouteGuard,** deny by default.
- **The session seam** the guard reads (criteria 11–14). It is a contract, not a login: nobody can sign in until F1.5.

**Out of scope**
- **Login UX, sign-in, and anything that creates a session** (F1.5).
- **The Supabase-backed session source:** restoring a session, refreshing it, server-side sign-out, handling a 401 from
  the server, and stopping suspended or banned accounts (F1.5, under Q1).
- **Return-to-destination after sign-in.** FR-FEED-007 needs it. It belongs to F1.5 (Q3).
- **The Google flow:** OAuth, the callback, Google branding, the provider setup (F1.8). Registration (F1.3/F1.4).
  Account-type selection (PG-003, I11).
- **TopBar search, chat and bell** (AC-033 remainder, I7/I8). Unread counters.
- **Every other FR-MENU-001 item:** groups, friends, following, help, and Terms & Privacy, whose texts come in I9.
- **Admin/Moderator top bar and menu.** Account-type routing (only Regular exists in I1). Professional navigation
  (OP-016).
- "חנות" and "יועצים" are absent, not disabled. No avatar or user name in the shell (photo I5, no `/api/me`).
- **Changes to UI wave 1 components** go only as far as routing strictly needs, and their existing tests stay green.
  This includes wave 1 criterion 41: AppShell imports no router or auth code.
- No server route, no schema, and no `vercel.json` change (its SPA rewrite already exists).

**Data touched**  None. No table, no API call, no stored media. No DATA ARCHITECT.

**Risk flags**  Authentication/authorization (the RouteGuard). Unauthenticated surface (Welcome and the Guest
placeholders are public). A routing library would be a new dependency. Choosing it is BUILDER's call, and it gets
CRITIC review and npm audit. No new provider: Google is not wired here.

**Authorization**  F1.2 reads, writes and deletes no user data. The guard is a UX control, not the data boundary: data
stays protected by F1.1 (criteria 21–25: deny by default, a 401 without a token) and by RLS. A forged client-side
session reaches only empty placeholders (criterion 22).

**Route table (Q2)**
- **Guest:** `/` (Welcome) · `/login` · `/register` · `/auth/google`.
- **Protected:** `/home` · `/feed` · `/profile` · `/settings`.

**Acceptance criteria** — the tag in brackets goes into the test name.

*Welcome*
1. **Welcome content** [FR-AUTH-001 · AC-001 · AC-087 part]. A Guest at `/` sees, in DOM order:
   - the Logo
   - the WelcomeIllustration, decorative and static
   - an h1 "הצטרפות ל-Nestly"
   - the lead text (Q5)
   - three actions: "יצירת חשבון חדש", "המשך עם Google", "כבר יש לי חשבון"

   Exactly one action has the primary style: "יצירת חשבון חדש".
2. **Account actions** [FR-AUTH-001 · AC-001]. "יצירת חשבון חדש" navigates to `/register`, not to account type (PG-003).
   "כבר יש לי חשבון" navigates to `/login`. Each target shows its placeholder, with an h1 ("הרשמה" / "התחברות") and a
   back control to `/`.
3. **Google action** [FR-AUTH-005 · AC-087 part]. "המשך עם Google" navigates to `/auth/google`, a Guest placeholder with
   the h1 "המשך עם Google" and a back control. No Welcome action and no Guest placeholder sends a request to Google,
   to Supabase or to `/api/*`. Assert this on the E2E network log.
4. **A signed-in user is not a Guest** [FR-AUTH-001 precondition · FR-AUTH-002 output]. A signed-in session at `/`,
   `/login`, `/register` or `/auth/google` is replaced by `/feed`. The Welcome h1 is never in the DOM.

*RouteGuard*

5. **Guests are redirected** [FR-AUTH-004 · AC-016 · ERR-012]. A Guest who requests `/home`, `/feed`, `/profile`,
   `/settings`, `/marketplace` or `/profile/123` ends at `/` with Welcome shown, and no message.
   - The protected placeholder's content is never in the DOM, not even for one render.
   - The redirect replaces the history entry, so `history.length` is unchanged by it.
6. **Deny by default** [FR-AUTH-004]. The Guest allow-list is exactly the four Guest routes. A test walks the route
   table: every other route is protected. A route added in a test, and not on the list, is protected.
7. **Loading** [FR-AUTH-004 "before the screen loads"]. While the session state is `loading`:
   - Neither Welcome nor any shell or protected content is in the DOM.
   - A `role="status"` element reads "בטעינה".
   - On `signed-in`, the requested protected screen renders. On `signed-out`, the user lands on `/`.
8. **Session ends in place** [FR-AUTH-004]. When the session goes from `signed-in` to `signed-out` while a protected
   screen is open, its content leaves the DOM and the URL becomes `/`, without a document reload.
9. **Fails closed** [FR-AUTH-004]. A session source that errors, or rejects, is treated as `signed-out`.
10. **Signed-in, unknown path:** per DR-1. Under its recommendation, `/xyz` is replaced by `/feed`.

*Session seam*

11. **One seam** [§4.2 conventions · FR-AUTH-004]. The guard, the shell and the menu learn the session only through one
    seam:
    - three states: `loading`, `signed-in`, `signed-out`
    - one action: sign out

    An import scan shows that no file under `pages/`, `components/` or `features/`, and not the guard, imports
    `@supabase/*` or any other auth SDK.
12. **Testable without login.** Tests drive every state and transition without a network or a login screen:
    - loading→in
    - loading→out
    - in→out
    - error

    The access decision, from (state, path) to "render" or a redirect target, is tested without a DOM (OP-002, §4.1).
    F1.5's real source must pass the same contract suite.
13. **The production source (Q1).** In F1.2 the production session source always reports `signed-out`.
14. **No test source in production.** The test-only controllable source is absent from the Vercel build: a test greps
    the built `apps/web/dist` for its marker.

*AppShell*

15. **TopBar** [FR-TOP-001 · AC-033 part]. On every protected route the TopBar shows:
    - the Hamburger ("פתיחת התפריט") at the inline-start (right) edge
    - then the Logo

    The TopBar holds no other control: no search, no chat, no bell.
16. **Bottom navigation** [AC-005 · §7.1]. A nav named "ניווט ראשי" holds exactly three links, in DOM order:
    - "בית" → `/home`, with the home icon
    - "פיד" → `/feed`, with the nest (logo) icon
    - "פרופיל" → `/profile`, with the person icon (Q7)

    "חנות" and "יועצים" are not in the DOM. It is a bar at the bottom at 375 and a rail at the inline-start edge from
    1024.
17. **Current item** [AC-005]. On `/home`, `/feed` and `/profile`, exactly one nav link has `aria-current="page"`: the
    matching one. On `/settings`, none does.
18. **In-app navigation** [AC-005]. Each nav link navigates without a document reload (a window marker survives), and
    its placeholder shows its h1: "בית", "פיד" or "פרופיל".
19. **Side menu** [FR-MENU-001]. The drawer, titled "תפריט", holds exactly two items, in this order: "הגדרות" (a link to
    `/settings`) and "התנתקות" (a button). Neither one duplicates a nav destination.
20. **Settings** [FR-MENU-001]. Activating "הגדרות" closes the drawer, shows the Settings placeholder (h1 "הגדרות"), and
    moves focus to `main`.
21. **Logout** [FR-MENU-001 "Logout ends Session"]. Activating "התנתקות":
    - calls the seam's sign-out exactly once
    - closes the drawer
    - once the seam reports `signed-out`, shows Welcome at `/`

    Back afterwards shows no protected content: the guard redirects to `/` again.
22. **Placeholders are empty** [FR-AUTH-004 · NFR-SEC-002]. Each protected placeholder shows its h1 and the line from Q6,
    and nothing else. With the state forced to `signed-in` and no token, no protected placeholder sends a request to
    `/api/*`.

*Accessibility, RTL, copy, design*

23. **axe** [NFR-A11Y-001]. axe-core in Playwright finds zero violations on Chrome and on Edge, at 375 and at 1024, on:
    - Welcome
    - each Guest placeholder
    - each protected placeholder
    - the open drawer
24. **Titles and focus** [NFR-A11Y-001, WCAG 2.4.2, 2.4.3].
    - Each route sets its own `document.title` (Q6).
    - After every in-app navigation or redirect, focus is on the new screen's `main`.
    - Every action on Welcome, the shell and the drawer is reachable and operable by keyboard alone, in visual
      order.
25. **RTL** [rtl-hebrew]. On every route, `html` has `lang="he"` and `dir="rtl"`. At 375 no screen scrolls
    horizontally (`scrollWidth ≤ clientWidth`).
26. **Gender-neutral copy** [NFR-USAB-003]. Every new user-visible string uses neither a slash gender form nor a
    singular gendered imperative. A test greps the new source files for `/ה`, `/י`, `/ית` and `/ת` in Hebrew strings.
    The strings are those listed here and in Q5–Q6.
27. **Design consistency** [NFR-USAB-004 · design domain].
    - Screens compose only wave 1 components and tokens, and the design lint passes.
    - Storybook has stories for the Welcome page and for the composed shell: each nav item current, and the drawer
      open.
28. **Preview.** On the deployed Preview:
    - A full load of `/feed` as a Guest ends on Welcome at `/`.
    - A full load of `/login` shows the Login placeholder, not a 404.
    - `GET /api/health` returns 200.
    - ORCHESTRATOR compares Welcome with R2 at 375 and 1024.

    Nobody can sign in on the Preview until F1.5, so the signed-in shell is checked through the E2E screenshots and
    Storybook.

**Open questions**

- **DECISION REQUEST DR-1: a signed-in user on an unknown path** (a specification gap).
  - The SRS defines no not-found behaviour. FR-AUTH-004 covers only Guests.
  - **Recommendation:** replace the path with `/feed`. This adds no new screen and no new copy.
  - **Alternative:** a not-found state inside the shell. It needs copy, and an SRS entry.
  - **Owner:** ORCHESTRATOR (not reserved).
- **Q1. What the production session source does in F1.2.** → **Assumed if unanswered:** it always reports
  `signed-out`. F1.2 adds no supabase-js and no `VITE_SUPABASE_*` variables. F1.5 supplies the Supabase-backed source
  behind the same seam, and passes criterion 12's contract suite.
- **Q2. Paths.** → **Assumed if unanswered:** the route table above. `/` is Welcome, because FR-AUTH-001 is triggered by
  opening the site.
- **Q3. Where a Guest is redirected.** ERR-012 allows "Welcome/Login", and Login does not exist yet. → **Assumed if
  unanswered:** Welcome at `/`. The requested path is not kept. Return-to-destination is F1.5's to build.
- **Q4. How the Google action looks.** → **Assumed if unanswered:** a text-only secondary button, "המשך עם Google"
  (FR-AUTH-005 verbatim), placed second. It carries no Google mark: the official "G" breaks the no-hex-outside-tokens
  lint and the Google branding guidelines. F1.8 settles both with the provider.
- **Q5. Welcome lead text.** → **Assumed if unanswered:** the wave 1 wording, "קהילה חמה להורים ולהורים לעתיד, במקום
  אחד."
  - R2's longer text was marked provisional in R2.
  - It also names "בעלי מקצוע", who are post-MVP (§2.5).
- **Q6. The remaining copy.** → **Assumed if unanswered:**
  - placeholder line: "המסך הזה ייפתח בקרוב."
  - loading status: "בטעינה"
  - document titles: "<h1> · Nestly", with Welcome as "Nestly"
  - shell labels: as in the wave 1 stories ("ניווט ראשי", "פתיחת התפריט", "תפריט", "סגירת התפריט", "דילוג לתוכן
    הראשי")
  - back control: "חזרה"
- **Q7. The profile tab icon.** §7.1 says the user's picture. → **Assumed if unanswered:** the generic person icon
  (`UserIcon`) until profile photos (I5).
- **Q8. What Logout ends.** → **Assumed if unanswered:** F1.2's Logout ends the session through the seam, and there is
  no confirmation step. Server-side revocation, and what sign-out means across devices, are F1.5's.

**Size estimate**  About 850 lines.
- **BUILDER, about 450:**
  - the seam and its sources: about 80
  - the route table and the guard: about 100
  - Welcome: about 60
  - the placeholders: about 70
  - the shell composition and the menu: about 110
  - stories: about 60
- **TEST ENGINEER, about 400.**

Each part fits one window, so this is **one PR, built in two passes** on the same branch:
- **a:** criteria 5–14 and 22 (the seam, the route table, the guard, the placeholders)
- **b:** criteria 1–4, 15–21 and 23–28 (Welcome, the shell, the menu, accessibility, the Preview)

If BUILDER's share passes about 550 lines, part b becomes its own PR.
