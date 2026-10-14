# intake — app-shell-guard (I1, F1.2)

**Intent**        I1 per `.work/_initiatives/I1-accounts-access.md` → F1.2 (and Addendum 1). Afik 14.10: "חלק c ← F1.2".

**Problem**       There is no product screen yet: a visitor sees no Welcome, a signed-in user has no shell to land in, and
                  nothing in the web app keeps a Guest out of protected screens.

**Requirements**  FR-AUTH-001 (Welcome) and FR-AUTH-004 (Guest restriction) — `docs/srs/05-functional/auth.md` · FR-AUTH-005
                  (the "המשך עם Google" action on Welcome — display only; sign-in is F1.8) · FR-TOP-001, FR-MENU-001 —
                  `05-functional/navigation.md` · AC-001, AC-005, AC-016, AC-033 — `15-acceptance.md` · ERR-012 — `10-errors-edge-cases.md`
                  · PG-001 Welcome, AppShell (`07-screens-navigation.md`, §17) · R2 mockups `docs/design/mockups/r2-screens.html`,
                  `r2-desktop.html` · components from UI wave 1 (AppShell, TopBar, BottomNavigation, SideDrawer, AuthLayout, Logo).

**Open items**    How the web app learns it has a session: Supabase Auth client on the web, the server verifies (F1.1 c).
                  Login itself is F1.5, so F1.2's RouteGuard needs a session source it can be tested with — SPEC states the
                  seam; no default filled for login UX. Menu items beyond Settings placeholder and Logout are out (I1 scope).

**Risk flags**    authentication / authorization: **true** (RouteGuard, Guest restriction) · personal data: false · schema: false
                  · money: false · new external provider: false (Supabase Auth already decided) · unauthenticated surface:
                  **true** — Welcome is a public page.

**Path**          Elevated (two flags). One PR (Afik 14.10: ordinary UI feature = one PR, unless the spec exceeds one window).

**Team**          SPEC (opus) · BUILDER (opus) · TEST ENGINEER · CRITIC on opus · Accessibility and Design consistency domains
                  (new UI). No schema → no DATA ARCHITECT. No signals → no ALGORITHM & DATA.

**Gate 1**        ORCHESTRATOR alone (Afik 13.10: from F1.2 no spec is sent to him).

**Depends on**    F1.1 merged before BUILDER starts (the server hook). SPEC can run now.

**Next owner**    SPEC
