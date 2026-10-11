# intake — UI wave 1 (WORKPLAN 9.7)

**Intent**        WORKPLAN 9.7: "a component unit, wave 1, on the Standard path — tokens, fonts, shadcn and Storybook.
                  R3, the gallery, is the Preview. The first of 5 units." First, before any component: the Tailwind
                  class lint and the token contrast test (moved from 7.1, Afik 11.10.2026).
**Problem**       No screen can be built consistently: the approved design (`docs/design/tokens.md`, R1, R2) exists
                  only as documents and mockups. Every feature would otherwise re-invent buttons, fields and states.
**Requirements**  SRS §4.1–§4.2 (component layers and the shared components), §7 and Appendix A (screens and
                  sketches), NFR-A11Y-001 (WCAG 2.2 AA), NFR-USAB-003 (gender-neutral copy), NFR-USAB-004, NFR-USE-001.
                  Design: `docs/design/direction.md`, `tokens.md`, `mockups/r2-screens.html`, `r2-desktop.html`.
                  Decisions: "UI library package, approved in advance", "Design consistency without a design agent",
                  "Visual direction", R1, R2 (all 11.10.2026).
**Scope bound**   Wave 1 = the foundation plus the shared components the first initiative (I1: Welcome, Login,
                  Regular registration, the protected shell — `.work/_initiatives/I1-accounts-access.md`) needs.
                  Later waves add the rest of §4.2. Must fit one context window (hard rule 6): SPEC splits if not.
**Open items**    none blocking. Dark mode is not defined (decided). The final logo is OP-022 — a temporary
                  wordmark is the decided interim. Copy for the shell links points to placeholders until I9.
**Risk flags**    authentication or authorization: false — no auth logic, components only ·
                  personal data / health / minors / media: false — no data is stored or shown ·
                  schema migration, irreversible or destructive: false ·
                  money movement: false ·
                  new external provider: false — Storybook is built as static files, no Chromatic ·
                  unauthenticated endpoint or new external surface: false — the gallery is a static build
**Path**          Standard. New dependencies are pre-approved in one package (decision "UI library package"), so they
                  do not raise the path. No risk flag is true.
**Team**          SPEC · BUILDER (with design-system, accessibility, rtl-hebrew, ux-copy-he) · TEST ENGINEER (the
                  Accessibility domain: axe; Design consistency: story screenshots, non-blocking) · CRITIC (the
                  Accessibility and Design consistency checks). Trigger: "any new or changed UI".
**Gates**         Gate 1 and the Preview (R3, the Storybook gallery) are passed by ORCHESTRATOR (working rules,
                  11.10.2026). No Gate 2: no schema.
**Next owner**    SPEC
