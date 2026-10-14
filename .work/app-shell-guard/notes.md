# notes — F1.2 app-shell-guard (Welcome, AppShell, RouteGuard)

**Approach**
Both passes (a and b) on `feat/app-shell-guard`, one commit. React Router 8 (declarative mode) in `apps/web`.
- **Seam** `services/session/session-source.ts`: `SessionSource` (getState · subscribe · signOut) and `createSessionStore`,
  which wraps a source and fails closed. A throw from getState or subscribe, an unknown state value, or a sign-out that
  throws or rejects all leave the store `signed-out` for good, reported through `onError` (console by default). A second
  sign-out while one is running joins the first. React binding: `hooks/use-session.ts` (`useSyncExternalStore`) and
  `app/SessionProvider.tsx`.
- **Sources** `production-session-source.ts` always reports `signed-out` (Q1). `controllable-session-source.ts` is the
  test-only one: `set`, `fail`, `rejectSignOut`, `signOutCalls`, plus the marker `nestly-controllable-session-source`.
- **Route table and decision** `app/paths.ts` (Q2 paths, the Guest allow-list, both landings, `normalizePath`) and
  `app/access.ts` `decideAccess(state, pathname)`. It is pure, with no DOM and no React. Any state other than
  `loading`/`signed-in` falls into the signed-out branch.
- **Guard** `app/RouteGuard.tsx` wraps `<Routes>`. It decides before rendering children: loading → `SessionLoading`,
  redirect → `<Navigate replace>`. `app/AppRoutes.tsx` (router-agnostic) · `app/App.tsx` (BrowserRouter, `sessionSource`
  prop defaulting to production) · `main.tsx`.
- **Screens** `pages/welcome/WelcomePage.tsx` · `pages/placeholder/GuestPlaceholderPage.tsx` (Login, Registration, Google
  entry) · `ProtectedPlaceholderPage.tsx` (Home, Feed, Profile, Settings) · `app/ProtectedLayout.tsx` (AppShell bound to
  the router and the session; layout route with `<Outlet>`).
- **Focus and titles** `app/FocusOnNavigation.tsx` focuses `main` whenever `location.key` changes, which covers
  navigations and redirects but not the first load. Titles use React 19's `<title>` hoisting through
  `lib/document-title.ts`.
- **E2E build** `npm run build:e2e -w @nestly/web` builds mode `e2e` into `apps/web/dist-e2e`, where `main.tsx`
  dynamic-imports the controllable source and exposes it as `window.nestlyTestSession`.
  `npm run preview:e2e -w @nestly/web` serves it on 127.0.0.1:4174 with SPA fallback. In every other mode the branch is
  constant-false and the bundler drops it. Verified: the marker and `nestlyTestSession` are absent from `apps/web/dist`
  and present in `dist-e2e` (`controllable-session-source-*.js`).

**Decisions**
- **Router: `react-router@^8.4.0`.** The spec allows a routing library. React Router is in the pre-approved UI package
  (decisions 2026-10-11, "UI library package"). It pulls in `@remix-run/route-pattern` and `cookie-es`, both MIT.
  `npm install` reported 0 vulnerabilities. For CRITIC and npm audit.
- **Client-side navigation without putting the router inside wave 1 components.** BottomNavigation and MenuItem (link
  variant) gained an optional `onNavigate(href)`, called on a plain primary click (`lib/is-plain-click.ts`). Modified
  clicks stay with the browser. AppShell forwards `onNavigate`. Welcome and the back controls use the stock `Button`
  with React Router's `useLinkClickHandler`; Button is unchanged.
- **Closing the drawer on a menu item** (deferred from wave 1 to I1). AppShell's `menu` may now be a function that
  receives `closeMenu`. `closeMenu` closes the drawer and sends focus to `main` (criterion 20) instead of the
  Hamburger. Escape, the close control and the backdrop still return focus to the Hamburger (wave 1 [R-esc]/[R-focus]).
  This needed an optional `finalFocus` on SideDrawer/DrawerPanel. Radix restores focus in a `setTimeout` after
  unmount, so focusing `main` from outside would be overwritten.
- **Placeholder line on the Guest placeholders too.** Q6 names one placeholder line with no restriction, so they
  share `pages/placeholder/placeholder-text.ts`.
- **Loading** uses Skeleton lines and a visually hidden `role="status"` reading "בטעינה". The design system forbids a
  centred spinner.
- **Path matching** `decideAccess` drops trailing slashes, as the router does, and is case-sensitive. `/LOGIN` for a
  Guest therefore redirects to `/` even though the router alone would match it. This fails closed.
- A click on the nav item already open uses `replace`, so it does not stack a duplicate history entry.

**Deviations**
- None from the criteria. Size: about 565 added code lines (no comments or blanks; stories included), about 720 with
  comments. That is past the spec's ~550 threshold for splitting part b into its own PR. It was built as one pass, so
  splitting is ORCHESTRATOR's call.

**Deliberately not done**
- No icons on "הגדרות"/"התנתקות". The icon module was not extended: wave 1 changes are limited to routing needs, and
  MenuItem without an icon is a supported state.
- No Playwright config change. `playwright.config.ts` serves only the built Storybook. Running the app E2E needs a
  second `webServer` (`npm run build:e2e -w @nestly/web` then `npm run preview:e2e -w @nestly/web`, port 4174). That
  is TEST ENGINEER's.
- `check-stories` STATES not extended to `pages/` or `app/`: the tool covers `components/` only. Stories exist:
  `pages/welcome/WelcomePage.stories.tsx` and `app/ProtectedLayout.stories.tsx` (Home, Feed and Profile current;
  Settings with none current; drawer open through `play`).
- No new stories for AppShell, BottomNavigation, MenuItem or SideDrawer. Their new props are behaviour, not visual
  states. `check:stories` passes.
- `tests/App.test.tsx` not touched (see Uncertain).

**Uncertain**
- **`apps/web/tests/App.test.tsx` fails** (1 of 313). It is the 7.0 skeleton smoke test and expects a heading named
  exactly "Nestly", which criterion 1 replaces with "הצטרפות ל-Nestly". It is not mine to edit. FINDING for TEST
  ENGINEER: retire it or rewrite it against criterion 1.
- **Focus ring on `main`.** After a redirect or navigation, `main` (tabIndex -1) receives focus. Chrome draws the global
  `:focus-visible` ring around the whole column when the last input was not a pointer, for example after a redirect on
  load. Wave 1's skip link does the same. No CSS change made; a design-consistency call for CRITIC.
- **Fail-closed is sticky.** Once the source errors, the store stays signed-out until reload. That is right for F1.2.
  F1.5 should confirm it suits the Supabase source, e.g. a refresh error followed by a new sign-in.
- **`FocusOnNavigation` uses `document.querySelector('main')`.** That works because exactly one `main` is mounted per
  screen; the drawer has none.
- **`main.tsx` uses top-level `await`** in the e2e branch. Vite 8's default targets support it, and the build passed.

**Preview path** (ORCHESTRATOR)
1. Full load of `<preview>/feed` → Welcome at `/`, no message, URL `/`.
2. Full load of `<preview>/login` → "התחברות" placeholder with "חזרה", not a 404.
3. On Welcome, check one filled action, "יצירת חשבון חדש". "המשך עם Google" → `/auth/google` placeholder. "כבר יש לי
   חשבון" → `/login`. Network shows no Supabase, Google or `/api` request.
4. `GET /api/health` → 200.
5. Compare Welcome with R2 at 375 and 1024.

Known not to work on the Preview: no signed-in state, by design (Q1). The shell is seen in Storybook
(`app/ProtectedLayout`) and in the e2e build. Locally I drove the e2e build in Chrome with a scratch script and saw:
- every redirect replaced history
- focus on `main` after each move
- the titles
- Logout called sign-out once
- `fail()` landed on Welcome
- no horizontal scroll at 375

**Node engine (CRITIC low, ORCHESTRATOR decision)**
- `react-router@8.4.0` declares node `>=22.22.0`, and jsdom already declared `^22.22.2`. So:
  - `.nvmrc` → `22.22`; `actions/setup-node` resolves it to the latest 22.22.x patch.
  - Root `engines.node` → `>=22.22.0`; the lockfile's root entry was synced by `npm install`.
- No workspace declares engines. Nothing else pins 22.18: CI and `migrate.yml` read `node-version-file: .nvmrc`, and
  `vercel.json` has no Node setting.
- **For Afik:** check Vercel → Project Settings → Node.js Version is 22.x. Vercel takes the major from there, and a
  `>=` range in `engines` can make it warn or pick the newest major. Patch updates within 22.x are automatic. I could
  not read the dashboard, and the release-index lookup was denied, so the exact latest patch is unverified.
- This machine runs Node 24.11, which satisfies both ranges.

**Neighbouring**
- `vite preview` logs a 404 for a resource on first load, most likely `/favicon.ico` (index.html declares none). It
  predates this change.
