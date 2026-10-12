# Decisions

Append-only. Newest last. One entry per material decision.

**Agents must read this before proposing an approach.** Re-proposing a rejected alternative wastes
Afik's time and burns tokens.

Format:

```
YYYY-MM-DD | <decision in one line>
  alternatives: <what else was considered>
  why:          <the reason>
  accepted cost: <what we are knowingly giving up>
  decided by:   <who>
```

---

2026-09-12 | ORCHESTRATOR is the main loop, not a separate agent
  alternatives: a PM subagent · no orchestrator at all (Afik orchestrates)
  why:          orchestration requires the full task context. Moving it into a subagent puts a
                context boundary exactly where all the context is needed. "No orchestrator" was the
                flaw in the earlier draft — it silently made Afik the orchestrator, spending the one
                resource the design exists to protect.
  accepted cost: the main loop's context accumulates across features and will need resetting between
                initiatives.
  decided by:   Afik

2026-09-12 | BUILDER is a subagent, not the main loop
  alternatives: main loop builds, for maximum coherence
  why:          a builder's context should start fresh per feature and hold only the spec plus the
                code it touches. The orchestrator's context accumulates. Mixing them is context rot.
                The handoff is free here because the output is a diff, not a summary.
  accepted cost: the orchestrator sees artifacts rather than code detail.
  decided by:   Afik

2026-09-12 | Six agents, not eleven
  alternatives: the 11-role model from agent_operating_model_skill_registry_v1
  why:          split agents only where context is genuinely disjoint. Walking real features showed
                data access, server logic and client are interlocked in every one — a
                frontend/backend split creates a handoff with no context gain. Coding is a coherence
                task, the weakest case for multi-agent.
  accepted cost: no independent design, devops, analytics or AI specialist until a failure pattern
                earns one.
  decided by:   Afik

2026-09-12 | No role-specific skill files yet
  alternatives: write acceptance-design, code-review, adversarial-testing, schema-discipline as
                separate SKILL.md files
  why:          each would be the *only* activity of exactly one agent, always active. A skill that
                is always loaded by one agent is that agent's definition with extra indirection —
                the Skill Explosion anti-pattern. Methodology therefore lives in the agent
                definitions. A skill gets created when a second agent needs the same method, or when
                a method is used occasionally rather than always.
  accepted cost: if a second agent later needs one of these methods, it must be extracted then.
  decided by:   Afik

2026-09-12 | Gate 2 is scoped by risk, not applied to every feature
  alternatives: Gate 2 on every feature, per the original model
  why:          for ordinary code the diff *is* the plan; approving a plan and then the code means
                Afik reads twice. Gate 2 is retained where the HOW is expensive and hard to reverse:
                schema.md covers migrations, irreversible changes and external providers.
  accepted cost: a non-schema feature with a bad internal approach is caught at review, not before.
  decided by:   Afik

2026-09-12 | As-built is the repo, plus two maintained knowledge files
  alternatives: a maintained prose as-built document describing the whole system
  why:          prose describing code drifts from it within days, producing a document that is wrong
                but looks authoritative. Code is generated-on-demand truth. The two things code does
                not express readably — the data model and the conventions — are maintained.
  accepted cost: answering "how does the system work" requires reading code or asking SCOUT.
  decided by:   Afik

2026-09-12 | Gate quality is instrumented in both directions, not only for misses
  alternatives: escapes.md alone, as originally built
  why:          a gate fails two ways. A reviewer raising ten findings of which nine are dismissed
                is worse than no reviewer — it costs attention and trains you to skim, so the one
                real finding gets skimmed too. Measuring only misses makes that invisible; it even
                reads as diligence, and the system ratchets stricter forever.
  accepted cost: a second log to maintain, and a judgment call each time about whether a dismissed
                finding was noise or merely low priority.
  decided by:   Afik

2026-09-12 | Improvement is budgeted and provisional, never stacked
  alternatives: add a check whenever something escapes
  why:          an only-growing checklist becomes a ceremony that catches nothing — the same disease
                as Skill Explosion. Hence: a per-agent cap where adding requires removing, a
                three-occurrence threshold before anything changes, and a 5-feature provisional
                period. The hard rule is never stacking a second rule on a failed first one: if a
                check did not prevent recurrence it was wrong, not insufficient.
  accepted cost: a real but rare failure mode may go un-checklisted for a long time. At solo
                velocity there is no statistical power here — conclusions are weak evidence, so
                reverting is preferred over defending.
  decided by:   Afik

2026-09-12 | Learning lands in knowledge files, not in agent definitions, by default
  alternatives: treat every escape as a method gap and patch the agent
  why:          an agent definition is distilled general practice and near its useful ceiling. A
                knowledge file is a specific fact about this codebase, which is what the agent
                actually lacks. Expect knowledge to change weekly and definitions 5-10 times in six
                months. Frequent definition tuning is the symptom of a misdiagnosed knowledge gap.
  accepted cost: requires a diagnosis step before any fix, which is easy to skip under pressure.
  decided by:   Afik

2026-09-12 | Primary market at launch: Israel only
  alternatives: Israel + open to EU users from day one · defer the decision
  why:          Amendment 13 applies regardless — Afik is a "controller" of a personal-data store
                holding health-related data from the first user. Staying out of GDPR scope at launch
                removes a whole class of mechanisms that would otherwise have to exist in the data
                model on day one: lawful-basis records, consent records per purpose, export and
                erasure flows.
  accepted cost: adding EU later is a migration over live data, including consent records that were
                never collected. Cheaper in this direction than the reverse, but not free.
  decided by:   Afik

2026-09-12 | CRITIC and TEST ENGINEER stay separate
  alternatives: merge into a single reviewer to save model calls
  why:          different outputs (findings that are consumed and discarded vs. test code that
                persists) and different definitions of good. Decisive reason: TEST ENGINEER must not
                see the diff. Merging it with the agent whose job is to read the diff destroys that
                rule, and with it the only thing that keeps tests from passing by construction.
  accepted cost: more model calls per feature.
  decided by:   Afik

2026-09-12 | IRON RULE — the system is built only in React, JavaScript, CSS, HTML
  alternatives: —
  why:          Afik's decision. Not open for relitigation.
  accepted cost: **this removes the typecheck gate.** Plain JavaScript has no compile-time checking,
                and typecheck was the cheapest and most reliable defence against the most common
                agent failure — inventing a function, a property or a field that does not exist. In
                TypeScript that error surfaces instantly and free; in plain JavaScript it surfaces at
                runtime, possibly on a rare path, possibly in front of a user.
                **Compensation required:** wider test coverage from TEST ENGINEER, and more load on
                CRITIC. Both cost tokens and neither is as reliable as a compiler.
                See Pending — a type-checking option exists that may satisfy this rule as written.
  decided by:   Afik — IRON RULE

2026-09-12 | Database: PostgreSQL via Supabase. One source of truth
  alternatives: MongoDB · Firestore · Neo4j · MySQL · two or more databases of record
  why:          (1) authorization — RLS exists only in a relational database, and without it "who can
                see what" spreads across dozens of read paths written by agents. (2) money needs
                transactions. (3) Organic Exposure is entirely aggregation — COUNT, AVG, ranking —
                and a document store forces hand-maintained counters that drift, turning a
                professional's reputation into a falsehood. (4) the product is relationships.
                (5) the schema now carries extra weight: with no typecheck it is the only remaining
                place where the system, rather than a user, reports that something does not exist.
                Neo4j rejected as over-engineering — queries here are one or two hops, not six.
                Two databases of record rejected: no transaction and no join across them, and
                authorization would split, reintroducing exactly the problem RLS solves.
  accepted cost: Postgres must be learned. Derived stores (Redis, a search index) may be added later
                when a measured need appears — as rebuildable copies, never as a second truth.
  decided by:   Afik

2026-09-12 | Authorization is enforced in the database, via RLS
  alternatives: enforcement in application code
  why:          a rule attached to the data cannot be bypassed by forgetting. Enforcement in code has
                to be repeated at every read path — feed, search, notifications, profile, related
                content, any future API — and one omission is a privacy leak in a product holding
                pregnancy data. Centralizing it also makes the entire authorization model reviewable
                in one file instead of auditable only path by path.
  accepted cost: DATA ARCHITECT becomes heavy — it owns the security boundary. RLS policies are
                written in SQL, which is database configuration and not application code, and
                therefore outside the iron rule.
  decided by:   Afik

2026-09-12 | UI: React + Tailwind
  alternatives: CSS Modules · hand-written CSS
  why:          Tailwind keeps styling next to the element, so an agent editing a component sees
                structure and style in one place. CSS Modules require a second file and a naming
                convention, and agents drift on naming conventions. Tailwind removes that whole class
                of inconsistency, and its built-in spacing scale and palette give visual consistency
                with no designer involved.
  accepted cost: verbose markup; a build step.
  decided by:   Afik

2026-10-10 | Test tooling follows the SRS: chosen per stage, kept in the repo, separate from business logic
  correction:   this replaces an earlier entry ("tests in JavaScript, decided by Afik", dated 12.9). Afik
                never made that decision — he had only asked a question — and it contradicted SRS
                NFR-QA-001. Replaced on 10.10.2026 at his instruction (D8).
  rule:         per SRS NFR-QA-001 and OP-018, QA tools are chosen per stage on professional merit, not
                bound to React or React Native. Test infrastructure stays separate from business logic and
                never changes production behaviour. The React/JavaScript iron rule governs product code;
                it does not govern QA tooling.
  web stack:    Vitest + React Testing Library (unit, integration) · Playwright on Chrome and Edge (E2E) ·
                axe-core inside Playwright (accessibility, WCAG 2.2 AA) · pgTAP (database and RLS) ·
                npm audit (dependencies) · performance deferred. Re-selected for Mobile at the start of the
                React Native phase.
  location:     tests live in the repo, so they run in CI and are versioned. They never ship.
  decided by:   Afik (D4 and D8, 10.10.2026)

2026-09-12 | CI and a PreToolUse hook are approved, to be built before the first agent runs
  alternatives: start building features and add gates later
  why:          every agent added before the automatic gate exists is working without a net. And with
                no typecheck, the remaining automatic gates carry more weight than originally planned,
                not less.
  accepted cost: none identified.
  status:       **APPROVED, NOT YET BUILT.** Nothing has been written. Afik instructed to lock the
                rules first and build nothing.
  decided by:   Afik

2026-10-10 | The SRS is maintained as markdown in docs/srs/, split per section; the Word file is archived
  alternatives: Word as master with a generated markdown mirror (recommended in D1) · Word only
  why:          Afik instructed: convert to markdown, split per section under docs/srs/, build an
                INDEX of every FR and AC, and archive the previous version "so there won't be two
                versions". Read as: markdown is now the single master. One source of truth that agents
                read directly, with every change reviewable as a git diff.
  accepted cost: SRS edits happen in markdown, not Word. A Word copy, if ever needed (e.g. for
                submission), has to be exported. INDEX.md must be updated whenever an FR or AC is added
                or changed.
  verification: the conversion is lossless. All 4,392 text blocks of the docx appear verbatim; all 1,991
                non-blank source lines were written to exactly one file; 82 FR and 73 AC accounted for.
                Callout boxes became blockquotes and style-based bullets became list items. Text was not
                changed.
  still open:   the scope of the "every change updates the SRS" rule, and versioning (rest of D1).
  decided by:   Afik (instruction of 10.10.2026; the reading "markdown is the master" was stated to him)

2026-10-10 | SRS scope, versioning and Word export (D1, completed)
  scope:        product behaviour, plus the technical decisions the SRS already has a place for (market, DB,
                QA stack…), is recorded in the SRS. Changes to the agent team and its tooling go to this
                file. Every SRS update follows the document's existing structure and writing logic, so the
                document always stays in order.
  versioning:   a minor version per batch of changes (2.2 → 2.3 …), each with a row in the change-history
                table in docs/srs/00-document-info.md. The INDEX is rebuilt with tools/build-srs-index.js.
  export:       a complete, current SRS must be producible as a Word document on request, reflecting every
                change. The markdown structure (INDEX order, section files) is the input to that export.
  status:       scope and versioning applied in SRS 2.3. Word export: `node tools/export-srs-docx.js` writes
                exports/Nestly_SRS_v<version>.docx in the original's format (A4, Arial 11, right-to-left).
                Verified on 2.3 by round-trip: all 4,483 text atoms of the 38 markdown files present, 120 of
                120 tables. Visual layout not checked on our side — no Word or LibreOffice renderer.
  decided by:   Afik

2026-10-10 | ALGORITHM & DATA agent — owns algorithm rules, data purpose limits, evaluation and review (D2, option A)
  alternatives: the same agent also writing the ranking code (B) · extend DATA ARCHITECT (C) · a cross-functional domain (D)
  why:          SRS v2.2+ makes ranking and analytics mandatory in v1 (ALG-01..09, §13.2 data usage matrix,
                §13.3 event taxonomy, §18). A builder wiring the feed will use whatever data improves
                ranking; purpose limits (no child or tracker data for paid targeting, no chat content in
                personalisation) erode silently, and whoever writes the scoring cannot judge ranking
                quality. BUILDER still writes all code, so the coherence rule holds.
  boundary:     DATA ARCHITECT asks who may access which row (access control, RLS). ALGORITHM & DATA asks
                which data may serve which purpose (purpose limitation, signals, ranking, events).
  rejected:     C puts two specialities in one agent and leaves ranking quality unowned; D cannot own the
                three assets involved (AlgorithmConfiguration, event taxonomy, data usage matrix).
  decided by:   Afik

2026-10-10 | AI/ML agent: dormant — no agent file yet; entry conditions recorded; AI ideas live in the SRS (D3, option 1)
  why:          SRS v1 has no ML/LLM (P-ALG-01, NFR-ALG-001, BR-049). An agent with no work tends to push
                AI where it is not needed.
  preparation:  every AI/ML idea or decision is recorded in the relevant place in the SRS — Appendix D while
                it is a future option, the relevant FR/§18/NFR once decided — so a future agent can start
                from the SRS. Entry conditions and the map of AI-relevant SRS locations are in
                .claude/knowledge/ai-ml-readiness.md.
  entry:        the agent is created only when Afik approves a concrete AI use case that passes Appendix D's
                gate: use case, data, value, safety, cost and fallback, plus model governance (provider,
                version, evaluation, red-team, latency, rollback).
  decided by:   Afik

2026-10-10 | Product decisions D5 and D6 are recorded in the SRS (2.3), not here
  pointer:      Basic Public Profile and Open profile (D5a), anonymous posting (D5c), WCAG 2.2 AA (D6) —
                see docs/srs/00-document-info.md change history. Open detail points: OP-019, OP-020.
  agent side:   D6 also adds an Accessibility domain to .claude/workflow.md.
  decided by:   Afik

2026-10-10 | First initiative deferred (D7)
  decision:     not set now; a structured plan comes later.
  kept:         CI and the PreToolUse hook must exist before the first feature runs (entry of 12.9).
  decided by:   Afik

2026-10-10 | External engineering guidelines reviewed: nine practices adopted, the coordination layer rejected
  source:       a guidelines package written for another product (Codex/Cursor, TypeScript, Next.js, NestJS).
                Analysis, topic by topic: docs/engineering-guidelines-review-HE.md. The package itself is not in
                the repo.
  adopted now:  A1 bug-fix path — bug.md, failing regression test from TEST ENGINEER first, root-cause fix
                (workflow 1.1, TEST ENGINEER 1.1) · A2 superseded code removed in the same change (BUILDER 1.1,
                CRITIC 1.1) · A3 BUILDER reads in full what it changes, plus its consumers · A4 Supabase platform
                rules: no service_role in product code, atomic multi-step writes as one function, SECURITY
                INVOKER by default, exposed schema = public API, ownership set by the database, identifiers
                generated by the database (data-model.md) · A5 raw errors never shown to users (conventions.md)
                · A6 BUILDER never edits TEST ENGINEER's tests or swallows errors · A7 preview path in notes.md
                · A8 neighbouring bugs logged in debt.md · A9 evidence in result.md
  SRS 2.6:      §4.1 — no Feature imports another Feature; the logic layer is free of Web-only APIs, for the
                React Native phase; the code-division rules are enforced by lint/CI, including a file-size cap
  part 7:       ESLint max-lines — Page/Feature/Component 600 · hook 300 · service 400 · utility 300 · Edge
                Function 400 · ESLint import boundaries with core rules, no new dependency: no Feature→Feature,
                Shared UI imports no features or services, the logic layer never touches react-dom, window or
                document · a hook blocking `git add -A` and `git add .` · folder skeleton and naming decided at
                the start of part 7, because the import boundaries need the paths
  later:        with the relevant feature — wizard container contract · VAL rules as one JS module (Zod is a
                DECISION REQUEST) · log shape with a privacy rule · overlay checklist in the Accessibility domain
                · rate-limit mechanism (NFR-SEC-006) · privacy and incident skills, synthetic fixtures only,
                before launch · "port, don't rewrite" in the React Native plan · AI structured outputs and
                per-call cost tracking when the AI agent is created
  rejected:     mission board, cards, sprints, a coordinating lane, sessions waking each other — there are no
                parallel sessions here · a changelog entry per change — a fourth record of what git, result.md,
                the SRS history and this file already hold · "always read every file in full" — burns the
                context the work needs; the reduced form is A3 · API route per call, NestJS layers, guards,
                throttler, CORS, an Express allowlist — a different architecture; what applies became A4 ·
                per-folder barrel files — upkeep, and stale exports surface only at runtime without a typecheck
                · TypeScript, LangGraph, OpenRouter, a templates package, a monorepo — iron rule or not relevant
  status:       design-time changes outside the retro loop (learning.md §9), provisional until 5 features like
                any other change to the model
  preserved:    iron rule (React, JavaScript, CSS, HTML) · Web first, React Native only after approval · the
                two human gates · the three review rules
  decided by:   Afik ("בצע לפי המלצות", 10.10.2026)

2026-10-10 | Web build: Vite, React single-page app
  alternatives: Next.js
  why:          server-side code lives only in Supabase Edge Functions, so Next.js would add a second server
                layer with nothing to do. A single-page app keeps the client a pure React consumer of Supabase —
                the same shape the React Native app will have. Resolves an inconsistency: docs/glossary-HE.md
                named Next.js, and nothing had decided it.
  accepted cost: no server-side rendering, so pages are not indexed by search engines. Consistent with the
                product: a Guest reaches only Welcome, Login and Registration (FR-AUTH-004).
  preserved:    Vite is a build tool only. Product code stays React and JavaScript (iron rule). Recorded in
                SRS §11 (2.6).
  decided by:   Afik (10.10.2026)

2026-10-11 | Rule 0 reopened: all product code in TypeScript — web, server and shared
  supersedes:   2026-09-12 "IRON RULE — the system is built only in React, JavaScript, CSS, HTML". Also closes the
                Pending item "Type checking via JSDoc".
  rule:         React · TypeScript · CSS · HTML for the web app · Node.js + TypeScript for the server ·
                TypeScript in packages/shared. `strict: true`; no `any`, no `@ts-ignore`, `@ts-nocheck` or
                `@ts-expect-error`; `as` restricted. Enforced in CI and by CRITIC.
  why:          the iron rule's accepted cost was the typecheck gate — the cheapest and most reliable defence
                against an agent inventing a field, a prop or a function. A typecheck over the whole repo restores
                it, and packages/shared carries one set of types and validations to the web app, the server and,
                later, the mobile app.
  accepted cost: a typecheck step in CI; typescript-eslint as a required dev dependency (ESLint core cannot lint
                TypeScript); types can still be defeated by casts — hence the bans above.
  kept:         Web first in React; React Native only after the Web version is complete and Afik approves
                (SRS §4, §11, OP-002). No alternative UI framework. QA tooling still follows NFR-QA-001.
  decided by:   Afik (11.10.2026, "מאשר, החלטה שלי")

2026-10-11 | Own server: Node.js + TypeScript on Fastify, layered route → service → repository
  supersedes:   the stack line "server-side code only where a secret requires it, as Supabase Edge Functions in
                JavaScript" (CLAUDE.md and conventions.md since the first version; it never had an entry here).
                Revisits the 2026-10-10 guidelines-review rejection of "API route per call, NestJS layers…": that
                rejection rested on there being no server.
  shape:        Fastify. route ≤200 lines → service ≤400 → repository ≤400. The web app reaches product data only
                through the server.
  why:          Fastify gives full TypeScript, schema validation and mature plugins for JWT, rate limiting
                (NFR-SEC-006) and security headers, without NestJS's dependency-injection layer. A server of our own
                puts transactions, rate limits and input validation in one place.
  path rules:   with a server, every feature adds endpoints. The risk flag "a new publicly reachable endpoint" and
                the Light-path condition "no new endpoint" become "an endpoint reachable without authentication, or
                a new external surface" — otherwise every feature would be Elevated.
  accepted cost: a server to host and operate (hosting not decided); one more process to secure.
  decided by:   Afik (11.10.2026)

2026-10-11 | Monorepo with npm workspaces: apps/web · apps/server · packages/shared · apps/mobile later
  shape:        apps/web — React + Vite, TypeScript · apps/server — Node.js + TypeScript · packages/shared —
                validations (VAL-xxx), types and constants, with no DOM and no Node APIs · apps/mobile — React
                Native, later only (SRS §11, OP-002), against the same server.
  boundaries:   shared imports nothing from apps; web never imports server; plus the 2026-10-10 boundaries inside
                the web app. Enforced by lint (WORKPLAN 7.1).
  why:          npm workspaces add no new tool. packages/shared is the contract between web, server and future mobile.
  decided by:   Afik (11.10.2026)

2026-10-11 | Supabase: managed Postgres (the only database) and Supabase Auth; Data API off; Storage and Realtime TBD
  extends:      2026-09-12 "Database: PostgreSQL via Supabase. One source of truth" — unchanged.
  auth:         Supabase Auth. The web app uses supabase-js for sign-in only. The server verifies the JWT through
                JWKS with asymmetric keys, ignores the token's role and forces `authenticated`. Account type and
                permissions are read from database tables only, never from user_metadata. The password-recovery
                channel stays TBD (SRS §12). The JWT verification library is chosen in part 7.
  data api:     the Supabase Data API (PostgREST) is off for the product schema. Product tables live in a schema the
                API does not expose, with anon privileges revoked — defence in depth if the API is ever re-enabled.
  storage:      TBD until the media feature (SRS §12, NFR-MEDIA-001). A direction to examine then is noted in
                WORKPLAN — it is not a decision. Realtime: TBD.
  decided by:   Afik (11.10.2026)

2026-10-11 | Database access: Drizzle, through roles that cannot bypass RLS, with the user's identity in every transaction
  extends:      2026-09-12 "Authorization is enforced in the database, via RLS" — unchanged and still the source of
                truth. The server authenticates, validates and rate-limits; it never filters rows for permission.
  how:          the full rules are in .claude/knowledge/data-model.md. In short: the server connects as app_server —
                LOGIN, NOBYPASSRLS, owns no table, granted authenticated (and anon for guest endpoints) WITH INHERIT
                FALSE, SET TRUE, never service_role. Every request runs in a transaction that sets the role and
                `request.jwt.claims` locally; outside one, every query fails. Pooler in transaction mode, postgres-js
                with prepare: false. Migrations by a separate owner role over a direct connection, never at
                runtime. FORCE ROW LEVEL SECURITY on every table; every view WITH (security_invoker = true).
                Background jobs run as app_jobs in a separate process, with credentials the request server cannot
                reach.
  unchanged:    settings.json — drizzle-kit stays under ask.
  decided by:   Afik (11.10.2026)

2026-10-11 | Audit is written by the database in the same transaction; protected reads go through audited functions
  how:          admin and moderator writes are audited by triggers (an approved SECURITY DEFINER exception);
                `authenticated` has no INSERT, UPDATE or DELETE on the audit table; the reason travels in a
                transaction-local setting. Reads a trigger cannot see — revealing an anonymous author (AC-077) and
                moderator access to Private Group content (NFR-PRIV-002) — go through a dedicated function that
                returns the data and writes the audit entry in the same call.
  anonymous:    the real author of an anonymous post is stored in a separate table, readable only by the author
                (author_id = auth.uid()) — to see, edit and delete their posts and get notifications on them. Nobody
                else reads it; the reveal function is the only other path. RLS hides rows, not columns, and a
                security_invoker view cannot mask a column its caller cannot read — hence a table, not a mask.
                Final shape at Gate 2.
  why:          NFR-AUDIT-001, BR-027: an action cannot happen without its record, and the server cannot forge one.
  decided by:   Afik (11.10.2026)

2026-10-11 | Zod for validation, in packages/shared
  supersedes:   the deferral in the 2026-10-10 guidelines review ("VAL rules as one JS module — Zod is a DECISION
                REQUEST").
  why:          one schema per VAL rule, shared by the web form and the server, native to TypeScript.
  decided by:   Afik (11.10.2026)

2026-10-11 | Traceability: FR/AC IDs in test names and an `Implements:` line in commits
  rule:         test names carry the FR/AC IDs they assert; each commit carries `Implements: FR-…, AC-…`. In code,
                an ID appears only beside a direct implementation of a BR or VAL rule — IDs scattered through code
                go stale. Step 14 also updates SRS §17 when pages, FRs or entities change.
  decided by:   Afik (11.10.2026)

2026-10-11 | Web build (2026-10-10): Vite stays, the reason is updated
  updates:      2026-10-10 "Web build: Vite, React single-page app". Its reason ("server-side code lives only in
                Edge Functions") no longer holds. The reason now: the server is a separate app (apps/server), so the
                web app needs no server-rendering layer of its own, and a single-page app shares its shape with the
                future React Native app. The web app is TypeScript (entry above), not JavaScript.
  decided by:   Afik (Vite 10.10.2026, TypeScript 11.10.2026)

2026-10-11 | Agent-model fixes from the comparison against the SRS
  changes:      an item the specification leaves open is never filled — stop and raise a DECISION REQUEST — now in
                BUILDER, DATA ARCHITECT and CRITIC, not only SPEC · descriptions of BUILDER and TEST ENGINEER match
                the bug-fix path · DATA ARCHITECT's stale analytics note points to ALGORITHM & DATA · a Not Ready
                from CRITIC or from ALGORITHM & DATA blocks · audit in the same transaction, a pgTAP pattern per
                Permission Key, NFR-ALG-001 and NFR-SEC-006 thresholds in the review points · SCOUT, not the
                built-in search agents, for codebase questions · CRITIC's budget count made exact.
  status:       design-time changes (learning.md §9), provisional until 5 features.
  decided by:   Afik ("בצע", 11.10.2026)

2026-10-11 | Skills introduced — process tools, shared methods, tasks and stack craft
  updates:      2026-09-12 "No role-specific skill files yet". Its criterion stands: a role's own method lives in
                its definition, and no skill is a single agent's always-on definition with extra indirection.
  criterion:    a skill exists when it is (a) a shared method used by two or more agents, (b) an on-demand
                procedure for the ORCHESTRATOR or Afik, or (c) craft for a part of the stack — version-bound,
                loaded by path or preloaded — which keeps agent definitions generic (rule 3).
  layers:       process — /where, /feature, /bugfix, /gate, synthesize, /wrap-up, /decision · shared — srs-lookup,
                rls-tests (after 7.1) · tasks — /srs-update, /srs-export, /srs-coverage (after the first feature) ·
                craft — rtl-hebrew, accessibility, security-craft, ux-copy-he now; react-web, fastify-api,
                drizzle-postgres, testing-craft, shared-contracts after 7.0
  rules:        one source of truth — skills point to CLAUDE.md, workflow.md, knowledge and the SRS, never restate
                them · knowledge holds project facts, skills hold craft · a skill with side effects (commit, SRS,
                decisions.md) is disable-model-invocation · SKILL.md under 500 lines · every skill states input,
                steps, stop conditions and a checkable done · caps and budget rules in learning.md §6
  names:        /where, not /status, and security-craft, not security-review — a project skill replaces a built-in
                command of the same name, and both built-ins stay useful
  step 14:      /srs-update is Afik's to invoke. Inside a feature, step 14 runs within /wrap-up, which follows the
                srs-update procedure; Afik invokes /wrap-up after the Preview
  not created:  agent-protocol (CLAUDE.md is loaded into every subagent; the return format went there) ·
                tbd-protocol (the rule is in CLAUDE.md and in five agent definitions) · db-identity (project facts
                belong in data-model.md; the code pattern goes to drizzle-postgres)
  plugins:      the org catalog has none that fit. From Anthropic's official set: security-guidance to be examined
                in 7.2, skill-creator used for authoring. feature-dev, code-review, pr-review-toolkit,
                commit-commands and frontend-design are not adopted — they duplicate this pipeline or its design
                sources.
  hooks (7.2):  per-agent hooks with one guard script: CRITIC cannot read notes.md; TEST ENGINEER cannot read
                apps/*/src (non-test files) or notes.md, by any tool — Read, Grep, Glob, git, or a shell command
                naming those paths (cat, less, head, type…) — and may read packages/shared, the contract; BUILDER
                cannot write test files; nobody runs `git add -A` or `git add .`.
  product:      Hebrew UI copy is gender-neutral — a product decision, recorded in the SRS (NFR-USAB-003).
  unchanged:    the ORCHESTRATOR owns the process (2026-09-12); skills are tools, not decision makers.
  decided by:   Afik (11.10.2026, "מאשר את כל ההמלצות")

2026-10-11 | UX/UI design track before the first UI feature — WORKPLAN part 9
  rule:         the visual language, tokens, a component gallery and mockups are approved before any feature writes UI
                logic. The 10 sketches are concept, not final design: a visual or layout change is shown in a mockup for
                approval; a change to behaviour the SRS describes is Afik's decision and goes to the SRS (D1).
  where:        product documents in docs/design/ (direction, tokens, components, sketches, mockups). Sketches copied to
                docs/design/sketches/ with readable names and a README mapping them; the source folder and zip are
                deleted only with Afik's approval, after the commit.
  sequence:     part 9 runs before part 8. 9.1–9.5 (sketches, direction, R1 directions board, R2 five screens, SRS 2.9)
                start now, in parallel with 7.0. 9.6 (skills, workflow) after 7.0. 9.7, the wave-1 component unit, runs
                through the Standard path after 7.1 and 7.2 as the first run of the pipeline, with the Storybook gallery
                as its Preview, and counts as the first of the 5 units for provisional changes.
  approvals:    R1 — palette, font, desktop layout · R2 — the five screens · R3 — the Storybook gallery.
  alternatives: design straight in code with no mockups · Storybook only, no static mockups (slower to change direction)
  why:          Afik's request: a design plan before the first UI feature, with his approval of every visual direction.
  accepted cost: three review rounds before the first feature.
  decided by:   Afik (11.10.2026, "מאשר את גרסה 2 של התוכנית"; 14–18 "לפי ההמלצה")

2026-10-11 | Visual direction: soft, calm, Facebook's patterns without its identity — no dark mode
  rule:         Facebook's structure and usage patterns (card feed, composer, top bar, bottom navigation, comments,
                dropdowns, "⋯" menu, **infinite scroll with no "load more" button**), none of its identity (no blue, no
                "f", no look-alike reactions). Warm pastel palette for surfaces; text and actions in the deep shade of the
                same hue. Rounded corners, soft shadows instead of borders — except input boundaries at 3:1 (WCAG 1.4.11).
                One primary action per card, secondary actions under "⋯". Quiet counters (pastel, "9+", no red, no
                pulse). No gender colour-coding. Touch targets 44×44. Warm, supportive, non-clinical tone.
  feed:         infinite scroll with role=feed and aria-busy while loading, ARIA feed keyboard pattern, one polite
                announcement per load, load errors inline with retry, no footer (Terms and Privacy live in the Side Menu
                and Settings), scroll position restored when returning from a post or profile, a quiet "back to top"
                button. v1 uses `content-visibility: auto` on post cards; TanStack Virtual only if a measured
                performance test fails.
  dark mode:    not required. No dark values are defined or tested. Tokens stay semantic so it can be added if ever
                decided; recorded in SRS §16 as a Future Enhancement.
  logo:         a temporary in-house wordmark; final brand identity tracked as a new OP.
  imagery:      in-house abstract SVG illustrations in the palette. No photos of babies or pregnancy in general screens,
                no third-party illustration sets in v1.
  pending:      palette (A apricot-terracotta · B sage · C lilac), font (Rubik · Assistant · Fredoka + Assistant) and
                desktop layout (centered column + nav rail, recommended · three columns) — Afik decides at R1.
  alternatives: Facebook's density and red counters · a "load more" button instead of infinite scroll (rejected by
                Afik) · dark mode in v1 (rejected by Afik)
  decided by:   Afik (11.10.2026: "פיד: גלילה אינסופית. בלי כפתור 'עוד'" · "מצב כהה: לא נדרש" · "3, 6: לפי ההמלצה")

2026-10-11 | UI library package, approved in advance
  rule:         one library per need, so BUILDER does not ask per dependency. Wave 1, installed in unit 9.7: shadcn/ui on
                Radix (with DirectionProvider for RTL), Lucide, @fontsource-variable with the chosen Hebrew font, React
                Hook Form + Zod (@hookform/resolvers), TanStack Query, React Router, Sonner, date-fns with the `he`
                locale and @date-fns/tz (calculations only; display stays on Intl), Storybook with addon-a11y, and
                shadcn's own clsx, tailwind-merge, class-variance-authority, tw-animate-css and react-day-picker.
                Approved, installed only when first needed: Recharts (with a table alternative for every chart) and
                TanStack Virtual (only after a failed performance test).
  not included: Motion (CSS transitions are enough for a calm UI; added when a need CSS cannot meet appears) ·
                libphonenumber-js (no phone field — see the product-changes entry) · an i18n library (Hebrew only) ·
                Chromatic (an external provider; Storybook is built as static files) · Vaul (Sheet covers the need).
  tokens:       one source in packages/shared/src/design-tokens/, generated into apps/web CSS by
                tools/build-design-tokens.js, with a Vitest contrast test over every token pair. Semantic names match
                shadcn's.
  versions:     locked at WORKPLAN 7.0 with the lockfile; npm audit in CI.
  decided by:   Afik (11.10.2026, "14–18: לפי ההמלצה"; 20: "libphonenumber-js יוצא מהחבילה")

2026-10-11 | Design consistency without a design agent
  updates:      2026-09-12 "Six agents, not eleven" — its accepted cost ("no independent design ... specialist until a
                failure pattern earns one") stands; this entry names who covers design consistency meanwhile.
  rule:         lint in CI (no physical direction classes, no arbitrary Tailwind values, no hex outside the tokens file,
                no @radix-ui imports outside components/ui) · a contrast test on the tokens · a `design-system` craft
                skill for BUILDER and CRITIC (after 7.0) · a "Design consistency" domain in workflow.md, modelled on
                Accessibility · one added CRITIC check (budget 19 of 20) · Playwright screenshots of stories,
                non-blocking at first · Afik at the Preview as the design authority.
  revisit:      three design-consistency escapes in escapes.md open an Agent Necessity Test for a design agent.
  decided by:   Afik (11.10.2026, "14–18: לפי ההמלצה")

2026-10-11 | Product changes from the sketch review — to be written into SRS 2.9
  welcome:      a static illustration instead of a rotating image (FR-AUTH-001) · a gender-neutral heading
  login:        email only, no username (FR-AUTH-002, PG-002)
  password:     VAL-003 / AC-003 — at least 10 characters, no upper/lower/digit/special requirement, any character
                allowed (Hebrew and spaces included), **no blocking of common or breached passwords**. One rule for
                Regular and Professional. Supabase Auth settings follow the same rule.
  registration: two steps, as in the SRS · account types shown as "חשבון אישי" and "חשבון מקצועי" (PG-003) · parent
                gender optional (VAL-006; the options stay with OP-004) · child fields required only when "יש לנו ילד"
                is chosen · due date for the pregnancy choice opens a new OP rather than being invented · a required
                Terms of Use and Privacy acceptance at the end of step 2, with links
  phone:        removed from both registration paths (PG-005, PG-007, FR-REG-004, FR-PROREG-002). VAL-004 and AC-017 are
                not needed for now. A phone, if ever needed, is added in account settings. Impact on FR-AUTH-003
                (password recovery): the channel stays TBD, but without a phone number no SMS option exists; email is
                the channel that remains — recorded as an impact, not decided.
  professional: no birth date (PG-006) · an optional "שם עסק" field · the sketch's field reads "מספר עוסק
                (מורשה/פטור)/ח.פ" — the reading is confirmed and OP-006 closes; the number is collected in the
                verification process (OP-005), not at registration, since an exempt dealer's number is usually a
                personal ID number
  navigation:   the Marketplace tab is labelled "חנות" · the Feed is the landing screen after login · Appendix A's
                reading of sketch 56 is corrected ("הרשת החברתית" — the Feed page, not a registration transition)
  feed:         one Reaction type in v1 (FR-FEED-003); its name is decided in the R2 mockup
  open points:  new OPs — brand identity and logo · coupons in the Marketplace · due date for the pregnancy choice
  pending:      the eighth tracker tile (OP-007) — Afik's answer left the choice blank ("[אמבטיה / אחר: ___]"); stays open
  why:          the sketches were read image by image on 11.10.2026; twelve gaps against the SRS were found
                (docs/design/sketches/README.md).
  decided by:   Afik (11.10.2026, "7–13: לפי ההמלצה" · "19, 21–27: לפי ההמלצה" · "20: אין צורך כרגע בטלפון" ·
                "28: קופונים כ-OP חדש" · "אין חסימה של סיסמאות נפוצות או סיסמאות שדלפו")

2026-10-11 | Bottom navigation: the services tab is labelled "יועצים"
  extends:      2026-10-11 "Product changes from the sketch review" — another tab label, to be written into SRS 2.9 (§7.1)
  rule:         the bottom-navigation tab that opens ServicesDirectoryPage (PG-011) reads "יועצים". The sketch's
                "נותני שירות ויועצים" does not fit a tab. The page's own name is unchanged.
  alternatives: "נותני שירות" (the shortened form shown in R1)
  decided by:   Afik (11.10.2026, "במקום 'נותני שירות' שנה ל-'יועצים'")

2026-10-11 | R1: direction A (apricot and terracotta), Rubik, centered column with a navigation rail
  extends:      2026-10-11 "Visual direction" — settles its pending palette, font and desktop layout
  palette:      direction A — background #FFF8F2, surface #FFFFFF, primary #B5502C (white text 5.06), primary deep
                #8F3E21, pastel #FDE6D8, secondary pastel (sage) #E3EEDF, text #3B2F2A, muted text #6B5A51, input border
                #9C8579. Values and contrast table in docs/design/tokens.md.
  font:         Rubik, one family for the whole interface, self-hosted in the product via @fontsource-variable.
  desktop:      a centered content column (feed 600–640, forms 560). From 1024px the five bottom-navigation
                destinations move to a vertical rail at the start side; no third column. NFR-USE-001 and §7.1 are
                updated in SRS 2.9.
  alternatives: B sage and oat with Assistant · C lilac on cream with Fredoka and Assistant · three columns in
                Facebook's style (docs/design/mockups/r1-*.html)
  decided by:   Afik (11.10.2026, "לפי המלצתך")

2026-10-11 | The eighth tracker tile is "אמבטיה" — OP-007 closes
  extends:      2026-10-11 "Product changes from the sketch review" — settles its pending OP-007
  rule:         the home-page tracker menu has eight tiles: הנקה, בקבוק, שינה, חיתול, תרופה, גדילה, חיסון, אמבטיה. The
                fields of the bath tracker stay open under OP-008, like every tracker except breastfeeding.
  decided by:   Afik (11.10.2026, "אמבטיה")

2026-10-11 | D7 closed: the product is built in 15 initiatives; the MVP is I1–I9
  supersedes:   2026-10-10 "First initiative deferred (D7)". Its condition stands: CI and the hooks exist before the
                first feature runs.
  roadmap:      ordered by dependency (SRS §17, §13, §3 and the authorization layers in data-model.md).
                MVP — I1 accounts and access (Regular) · I2 profile, privacy and Friends · I3 community feed · I4 safety
                and admin core · I5 media (images) · I6 home and tracking · I7 notifications and search · I8 chat and
                Support · I9 launch readiness. After launch — I10 groups · I11 professionals and services · I12
                Marketplace · I13 monetization · I14 Moderator team · I15 personalization and intelligence. About 77
                features: 45 in the MVP. Every FR and PG is assigned. The table lives in WORKPLAN part 8.
  mvp:          Regular accounts only · bottom navigation with three destinations (בית, פיד, פרופיל); חנות and יועצים
                are added when they are built · feed with text and images, comments and replies, one Reaction,
                anonymous posts and a basic ranking (authorization first, recency, stage — a subset of FR-ALG-002,
                designed by ALGORITHM & DATA) · images in posts and a profile photo, no video · home with the context
                card, breastfeeding and the trackers whose fields are defined, static tips written and reviewed by Afik
                · in-app notifications · People and Posts search with the enumeration protections · 1:1 text chat by
                polling: Friends, chat requests, Chat Block, Support Thread (OP-011: text only) · moderation by the
                Admin alone, with the audit log from day one · a closed beta with an invite list before an open
                launch.
  required:     reports on posts, comments, images and users, with a dedicated reason for an inappropriate image of a
                child · a moderation queue, content and image removal, warn/suspend/ban checked in RLS · private
                images behind short-lived signed URLs, EXIF and GPS stripped on upload · Terms of Use and Privacy
                Policy drafted by Claude from SRS §13.2 and §13.4 and reviewed by a lawyer before launch · consent at
                sign-up with its version · retention per data class, images included · manual export and deletion
                through Support · users 18 and over · community rules, including the policy on images of minors ·
                WCAG 2.2 AA, an accessibility statement, alt text for images.
  initiative 1: seven features — identity-platform, app-shell-guard, register-profile-step, register-account-create,
                login-session, password-recovery, auth-email-delivery. Scope: .work/_initiatives/I1-accounts-access.md.
  decided for I1: parent gender — אישה, גבר, אחר, מעדיפים לא לציין; child — בן, בת, עוד לא ידוע (OP-004) · an optional
                due date for the "בהריון" choice · password recovery by email (FR-AUTH-003) · email verification
                required before the first sign-in · the auth email provider is chosen in F1.7, reviewed by CRITIC ·
                users are 18 or over.
  before 9.7:   hosting for web and server, and the Preview environment — WORKPLAN 7.4.
  pending:      the media decisions M1–M6 (storage provider, formats and limits, policy for images of minors, EXIF
                stripping, hash scanning, retention) are decided before I5. A budget for the legal review is planned
                before I9.
  storage:      status in WORKPLAN part 8 · approved scope per initiative in .work/_initiatives/, written when each is
                approved · the MVP definition goes to SRS §2.5, §16 and Appendix B in batch 2.9 · no other status file.
  alternatives: professionals, groups or a Moderator team at launch · text-only posts at launch (Afik chose images) ·
                five bottom-navigation tabs with empty destinations · a "load more" feed (rejected earlier)
  decided by:   Afik (11.10.2026, "מאשר את התוכנית, עם השינויים הבאים" — 5: "מדיה נכנסת ל-MVP"; 12: "לפי ההמלצה"
                with a reminder for the legal-review budget before launch readiness; 20: "להחליט מוקדם, לפני 9.7";
                "כל השאר: לפי ההמלצה")

2026-10-11 | Elevated path: Afik approves gates, not diffs
  updates:      the path table in CLAUDE.md and workflow.md "Elevated path" (model of 2026-09-12): "Afik reviews the
                diff before merge" is removed. Extends 2026-09-12 "Gate 2 is scoped by risk, not applied to every
                feature".
  rule:         in the Elevated path the protection is CRITIC on opus, DATA ARCHITECT, CI and the hooks. Afik approves
                Gate 1, Gate 2 and the Preview. Gate 2 reaches him as a plain-language /gate page — what data is
                stored, who can see it, what can and cannot be undone, any external provider — with no SQL. An
                irreversible or destructive change still needs his explicit approval (Mandatory reviews). No Elevated
                feature runs before WORKPLAN 7.1 (CI) and 7.2 (hooks) are active.
  why:          Afik does not read code. A diff review by him would be a gate in name only, and would cost his
                attention without protecting anything.
  alternatives: keep the diff review · add an independent second reviewer agent
  status:       design-time change by Afik (learning.md §9 — a human gate changes only by his deliberate decision).
  decided by:   Afik (11.10.2026, "ביקורת diff שלי לפני כל merge לא נותנת הגנה אמיתית")

2026-10-11 | R2 approved; the post card gets four icon actions — Like, Comment, Share in feed, Share link
  updates:      2026-10-11 "Visual direction" — "one primary action per card" no longer applies to the post card,
                and the Reaction is named "לייק" after all. Its icon is Nestly's own (a heart with the nest line), not
                Facebook's.
  rule:         every post card carries four icon buttons: Like (decision 12, "לייק"), Comment, Share in feed (an
                internal share of another user's post into my feed, under my name, as on Facebook) and Share link (a
                link to the post, or to the site, sent by WhatsApp, email and the like). Each button has an
                accessible name and a tooltip. A link opened by someone signed out leads to sign-in (FR-AUTH-004).
  privacy:      on top of the existing permissions, never shared internally or externally — an anonymous post,
                content of a private group, children's details, a post by a user whose profile is Restricted.
  pending:      the SRS definition of sharing (FR-FEED-006, FR-FEED-007 and their BR, VAL, ERR and AC) — Claude's
                proposal, awaiting Afik's approval before SRS batch 2.9. Sharing enters the MVP in I3.
  alternatives: the R2 post card — one primary action ("חיבוק") and a quiet comments link (rejected by Afik)
  decided by:   Afik (11.10.2026, "כפתורי אייקון בכרטיס הפוסט: לייק, תגובה, שיתוף פנימי, שיתוף חיצוני" ·
                "Reaction = לייק" · "שאר R2 מאושר")

2026-10-11 | Repository layout and naming (WORKPLAN 7.0)
  rule:         English, readable names that follow the SRS logical names (§4.2, §7); no SRS IDs in file or folder
                names (IDs live in test names and in the commit's Implements line).
  layout:       apps/web/src — main.tsx · app/ (router, providers, route guard) · pages/<page>/<Name>Page.tsx ·
                features/<feature>/<Name>Feature.tsx or <Name>Flow.tsx, with hooks and pieces used only there ·
                components/ui/ (shadcn primitives) · components/layout/ (AppShell, TopBar, BottomNavigation,
                SideDrawer) · components/shared/ (Shared UI, §4.2) · components/domain/ (Domain Reusable, §4.2) ·
                services/<resource>-api.ts (HTTP to the server, no DOM) · hooks/ (app-wide only) · lib/ · styles/ ·
                assets/. apps/server/src — main.ts (local development: listen) · app.ts (the Fastify app) · a thin
                Vercel adapter that exposes app.ts as one function · jobs/ (background jobs, deployed apart as
                app_jobs — see "Hosting") · routes/<resource>.route.ts · services/<resource>.service.ts ·
                repositories/<resource>.repository.ts · db/ (Drizzle schema, client, identity transaction) · plugins/
                (auth, rate limit, error mapping) · lib/. packages/shared/src — validation/ (Zod, VAL) · types/ ·
                constants/ · errors/ (codes the web maps to ERR texts) · design-tokens/. supabase/ — migrations/
                (SQL and RLS policies), tests/ (pgTAP), seed.sql — the Supabase CLI layout, owned by DATA ARCHITECT.
                Tests sit outside src: apps/*/tests/ and packages/shared/tests/ mirror src; e2e/ holds Playwright
                with axe.
  naming:       folders kebab-case, from the logical name without its suffix (pages/welcome, features/regular-
                registration) · React component files PascalCase.tsx, the exact SRS name (WelcomePage,
                RegularRegistrationFlow, FeedFeature, PostCard), one component per file, stories <Name>.stories.tsx
                beside it · other modules kebab-case with a role suffix (posts.route.ts, posts.service.ts,
                posts.repository.ts, posts-api.ts, use-feed.ts) · shadcn primitives keep shadcn's kebab-case files —
                the only exception · identifiers: PascalCase components and types, camelCase functions, Zod schemas
                <name>Schema, constants UPPER_SNAKE · tests <module>.test.ts(x), E2E <flow>.spec.ts · imports: @/
                inside an app, @nestly/shared between packages; packages @nestly/web, @nestly/server, @nestly/shared.
                Database names are DATA ARCHITECT's, decided with the first table (data-model.md).
  why:          tests outside src let the 7.2 hooks block by path — TEST ENGINEER never reads apps/*/src, BUILDER
                never writes apps/*/tests, e2e/ or supabase/tests — which is simpler and harder to slip past than
                file-name patterns. Folders mirror the §4.2 layers, so the CI import boundaries (7.1) are
                path rules.
  alternatives: tests beside the code (*.test.tsx in src) · feature-sliced layout · Drizzle migrations under
                apps/server
  decided by:   Afik (11.10.2026, "7.0: תחליט לפי ההמלצה שלך, בהתאם ל-SRS ולמוסכמה")

2026-10-11 | Hosting: the web app and the server on Vercel (the server as Vercel Functions), the database on Supabase (WORKPLAN 7.4)
  updates:      2026-10-11 "Own server: Node.js + TypeScript on Fastify" — Fastify and its layers stay; the server is
                deployed as Vercel Functions, not as an always-on process. 2026-10-11 "Supabase … Storage and
                Realtime TBD" — Realtime is decided below; Storage stays open (media decision M1, before I5).
  rule:         one Vercel project serves the static web app and the API at the same origin. The Fastify app runs
                as one function through a thin adapter; routes, services and repositories hold no Vercel-specific
                code, so the same app can move to an always-on host without a rewrite. Functions run in fra1
                (Frankfurt), next to the database.
  jobs:         background jobs run as app_jobs, deployed apart from the request functions so they never share
                credentials — SQL jobs in pg_cron inside the database, run as app_jobs; jobs that need code in a
                separate Vercel project that holds only the app_jobs credentials, triggered by Vercel Cron or by
                pg_cron through pg_net. A job is cut to fit the function limit (300 s on Hobby, 800 s on Pro).
  realtime:     chat and notifications poll in the MVP. Later, Supabase Realtime private channels carry signals only
                ("something changed") — never content; the client fetches the content through the server. Reason:
                Realtime checks its RLS policy when a client connects and keeps it for the connection, so a revoked
                or suspended user can keep receiving until the token expires.
  conditions:   rate-limit counters (NFR-SEC-006) live in Postgres — functions share no memory · an external
                error-monitoring service before the beta (Vercel keeps runtime logs 1 hour on Hobby, 1 day on Pro) —
                a new provider, reviewed by CRITIC · HEIC images are decided in M2 (the prebuilt image library does
                not read HEIC) · database connections through the pooler in transaction mode, one per function
                instance.
  prices:       checked on 11.10.2026 at vercel.com/pricing and supabase.com/pricing. Vercel Hobby $0, "personal,
                non-commercial use" only; Pro $20 a month per developer seat. Supabase Free: two active projects,
                500 MB database, 50,000 MAU, 1 GB storage, 5 GB egress, 200 pooler clients, paused after a week
                without activity, no branching; Pro from $25 a month.
  region:       Supabase Central EU (Frankfurt, eu-central-1) — the region closest to Israel; Supabase has none in
                Israel. Vercel functions in fra1.
  preview:      every feature gets one Vercel preview per branch, holding both the web app and the API. The database
                preview is the second free Supabase project, shared — safe because features run one at a time
                (rule 5). A feature's migrations run there; it is reset when a feature is rejected; production
                receives migrations only on merge. Previews need the code in a Git host.
  commercial:   Vercel defines commercial use as any deployment for the financial gain of anyone involved —
                payments, advertising products or services, ads. Hobby is used for development only; Vercel Pro
                ($20 a month) before the first deployment real users use (the closed beta, I9). Pro is also needed
                for cron jobs more often than once a day.
  cost:         $0 a month in development. About $20 in the beta. At launch about $45 or more: Vercel Pro, usage
                beyond its included credit, and Supabase Pro for backups and no pausing — decided in I9.
  move to an always-on server when: live chat at real scale (I8 later), heavy batch work (I15), or cold starts that
                hurt in practice — a deployment change, not a rewrite.
  alternatives: A — a separate always-on Fastify server on Railway (Hobby $5 a month, EU West Amsterdam, PR
                environments): no cold starts and no time limit, but two platforms to wire for every preview, a cost
                from day one, and the WebSocket rule kept as it was. Compared in full on 11.10.2026.
  pending:      a private GitHub repository as the remote, for CI (7.1) and the previews — Afik's approval, since it
                sends the code to an external service · the migration path (7.3): the direct connection is IPv6 only
                and CI may not reach it — DATA ARCHITECT decides between the session-mode pooler and the IPv4 add-on,
                which may change platform rule 5.
  decided by:   Afik (11.10.2026, "עבור לשיטה C"; earlier "אתר: Vercel … מסד: Supabase. כולל סביבת Preview לכל
                פיצ'ר"); the region chosen by Claude at his instruction ("תבחר אזור קרוב ל-Supabase").

2026-10-11 | Sharing defined — internal share in the feed and external share by link (to SRS 2.9)
  extends:      2026-10-11 "R2 approved; the post card gets four icon actions" — settles its pending SRS definition.
  ids:          FR-FEED-006 share in feed · FR-FEED-007 share a link · BR-064–067 · VAL-038 · ERR-033, ERR-034 ·
                AC-079–083 · NFR-PRIV-007. They enter the SRS in batch 2.9 (WORKPLAN 9.5).
  shareable:    only an active post the viewer may see. Never shared, internally or externally: an anonymous post,
                content of a private group, a post by a user whose profile is Restricted, sponsored content, a removed
                or hidden post, and anything that is not a post — profiles, children, Journey Summary, Tracker data,
                comments, messages. On a post that cannot be shared the share buttons do not appear; the server checks
                anyway.
  reference:    a share stores only a reference. The original is loaded on every view, under the viewer's
                permissions. When the original is deleted, hidden or removed, its author turns Restricted, is
                suspended or banned, or the viewer loses access, the share shows "הפוסט המקורי כבר לא זמין"; the
                sharer's own text stays, and nothing from the original is kept or shown, images included. A restored
                original appears again. Sharing a share shares the original and credits only its author.
  link:         the preview in WhatsApp or email is generic ("פוסט ב-Nestly") — no author, text or image. A signed-out
                visitor goes to sign-in (FR-AUTH-004) and returns to the post; a signed-in visitor without access sees
                "לא זמין". Every opened link re-checks access (NFR-SEC-005).
  also:         the author receives a notification when the post is shared (I7) · the share event joins the §13.3
                taxonomy; whether it affects ranking is ALGORITHM & DATA's call · no share counter in v1.
  decided by:   Afik (11.10.2026, "מאשר לפי המלצתך")

2026-10-11 | GitHub remote: github.com/afikyermi/Nestly, kept public for now
  rule:         the repository's remote is github.com/afikyermi/Nestly, for CI (7.1) and the previews (7.4). It stays
                public by Afik's choice: the SRS, decisions, the knowledge files (data-model.md included), the sketches
                and the author email in every commit are readable by anyone. The history was scanned before the first
                push — no keys, tokens, .env files or private keys.
  consequence:  a secret must never reach a commit — the 7.2 hooks and CI should block one before it is pushed ·
                going private later does not remove copies already made.
  alternatives: a private repository (recommended by Claude: it protects the product plan and the map of the
                authorization model, and gives a mistaken secret time to be fixed) · rewriting the author email to
                GitHub's noreply address before the first push (offered, not chosen)
  decided by:   Afik (11.10.2026, "כרגע נשאיר PUBLIC" · "תריץ")

2026-10-11 | JWT verification: `jose`, with `createRemoteJWKSet` against Supabase's JWKS endpoint
  alternatives: `@fastify/jwt` with JWKS (rejected — not used)
  why:          `jose` is a small, dependency-free library that verifies asymmetric tokens against a remote
                JWKS and caches the key set. It keeps verification a plain function in the server, independent
                of the Fastify plugin layer, and fits the rule that the server ignores the token's `role`
                claim and sets the identity itself (data-model.md rule 3).
  accepted cost: the server wires the verification hook itself instead of using a ready Fastify plugin.
  decided by:   Afik (11.10.2026)

2026-10-11 | `git push` moves from deny to ask in .claude/settings.json; force push stays denied
  rule:         every push prompts Afik for approval. `git push --force` and `git push -f` stay in deny.
  why:          the repo now has a GitHub remote and CI; Afik running every push by hand is friction, while a
                prompt keeps his approval on each one.
  alternatives: keep push denied, Afik pushes by hand (the state until now)
  accepted cost: the deny rules are prefix-matched, so a force flag placed after the remote or branch
                (`git push origin main --force`, `--force-with-lease`, `+main`) is not matched by them — it falls
                to the ask prompt instead. The 7.2 PreToolUse hook is the stronger control for it.
  decided by:   Afik (11.10.2026)

2026-10-11 | Migration path, migration role, Data API and pre-migration tests (WORKPLAN 7.3)
  source:       DATA ARCHITECT's recommendation, .work/infra-7.3/recommendation.md (facts verified 11.10.2026)
  path:         CI (GitHub Actions) applies migrations with the Supabase CLI through the session-mode pooler (port
                5432, IPv4), from a separate `migrate` workflow triggered by push and workflow_dispatch only — never
                pull_request or pull_request_target. Two GitHub environments, `preview` and `production`, each with
                only its own connection string. Moves to the direct connection when the IPv4 add-on is bought.
  approval:     production migrations run only from `main`, after Afik's approval on the `production` environment.
  role:         a dedicated `app_owner` (LOGIN, NOSUPERUSER, NOBYPASSRLS) owns the product schema and applies
                migrations. If a test shows a grant it needs is impossible on Supabase, `postgres` is used for that
                step only, recorded in data-model.md.
  rule 5:       data-model.md rule 5 and "Connections from functions" reworded as recommended.
  data api:     turned off entirely — first on nestly-preview, then T7 (sign-in still works); only if T7 passes,
                also on nestly-prod. Rule 7 unchanged: the product schema is not `public`.
  tests:        T2–T7 on nestly-preview only, with throwaway probe_* roles, in the order T2 → T3 → T4 → (Data API
                off, T7) → T6 → T5. T2 first: if `postgres` cannot grant `authenticated` with ADMIN OPTION, rule 2
                cannot be built as written and it returns to Afik as a blocker. Afik enters every password himself.
  conventions:  every migration is compatible with the code already running (expand → deploy → contract) · a
                destructive production migration gets a `supabase db dump` first (Free has no backups). Proposed
                by DATA ARCHITECT, to be validated by CRITIC before entering conventions.md.
  alternatives: the IPv4 add-on (needs Pro, about $29/month per project) · Afik's machine over IPv6 · CI over the
                direct connection (runner IPv6 unverified) · Supabase Branching (Pro) · `postgres` as the migration
                role (a leaked CI secret would reach auth.users and the platform)
  accepted cost: the first secrets enter a public repo's CI, fenced by environments and the trigger ban.
  decided by:   Afik (11.10.2026, "1 כן, 2 כן, 3 כן, 4 כן, 6 כן. 5 כן, בסדר הזה: קודם … nestly-preview …
                רק אם T7 עבר, מכבים גם ב-nestly-prod")

2026-10-11 | Working rules: ORCHESTRATOR decides and passes the gates; Afik keeps secrets, production and reserved decisions
  rule:         without asking Afik — commit and push; installing and removing libraries; running SQL and migrations on
                nestly-preview only (through tools/db-preview.mjs); passing Gate 1, Gate 2 and the Preview; deciding
                every unreserved DECISION REQUEST from the SRS and the professional recommendation, recorded here with
                the alternatives and the reason. CRITIC, CI and the hooks run unchanged; a specialist's verdict binds.
  reserved:     (1) secrets — Afik enters keys and passwords himself; no agent reads them or asks for them in chat ·
                (2) production — migrations to nestly-prod only from CI after his approval on the GitHub `production`
                environment; every direct path to prod stays blocked · (3) irreversible decisions and material SRS
                changes (adding or removing a feature, changing the security model) · (4) product points touching
                legal matters, data about minors, or money (added on Claude's recommendation, approved by Afik) ·
                (5) a disagreement with a specialist's verdict. Reserved items go to WORKPLAN "ממתין להחלטה שלך";
                work continues on whatever does not depend on them.
  tracking:     WORKPLAN-HE.md stays the only status file: updated at the end of every task, with the preview URL of
                everything built and everything waiting on Afik (secrets, prod migration approvals, decisions).
  enforcement:  settings.json — git commit, git push, npm install and npm uninstall allowed without a prompt; force
                push, psql and every .env read or write stay denied; `node tools/db-preview.mjs` allowed. guard.js
                (role all) — any shell command naming an .env file (other than *.example) or the production project
                ref is blocked. tools/db-preview.mjs reads .env.preview itself, refuses any target that is not the
                preview project ref, refuses the prod ref, and never prints the connection string.
  supersedes:   2026-09-12 "Human gates" (Afik approves Gate 1 and the Preview) · 2026-10-11 "Elevated: Afik approves
                Gate 1, Gate 2 and the Preview" · CLAUDE.md "DECISION REQUEST — only he can".
  alternatives: keep Afik on every gate (the previous model: safe, but every feature waited on him) · full autonomy
                with no reserved list (rejected: secrets, production and irreversible choices need a person)
  accepted cost: product decisions are made without Afik's review; the record here is how he audits them.
  decided by:   Afik (11.10.2026, a written rule set approved in chat with "מאשר", including the added boundary on
                legal, minors and money)

2026-10-11 | app_owner holds `authenticated` (inherit, no set); one anchor table carries the only FK to auth.users, added by postgres
  source:       DATA ARCHITECT, .work/infra-7.3/owner-role.md · evidence: T5 and P1–P4 on nestly-preview (tools/probes/)
  found:        on Supabase, `postgres` holds USAGE on schema `auth` and REFERENCES on `auth.users` without grant option
                (auth is owned by supabase_admin, auth.users by supabase_auth_admin). So an owner role can neither
                create a policy or function that calls auth.uid() (L2) nor an FK to auth.users (L1).
  rule (L2):    `grant authenticated to app_owner with inherit true, set false`. Verified: the full migration path
                (CLI over the session pooler, table owned by the owner, FORCE RLS, a policy with auth.uid(), the CLI
                history table) · the owner still cannot read auth.users and nothing is owned by authenticated (P1) ·
                `TO authenticated` policies bind the owner, who sees 0 rows without claims (P3) · a definer function
                owned by the owner returns the caller's uid (P4).
  rule (L1):    exactly one product table (the anchor, named with the first table) references auth.users; all others
                reference the anchor. `postgres`, made a member of app_owner (inherit, no set), adds that one FK in a
                versioned bootstrap run once per environment — on nestly-prod by Afik. Verified: the FK is created, the
                table stays owned by the owner, later owner DDL works, deleting the Auth user cascades (P2, bonus).
  data-model:   rule 5 extended; new paragraph "The auth.users anchor and bootstrap steps"; an open note under rules
                16–17 (FORCE RLS binds definer functions owned by app_owner — resolved at the first one's Gate 2).
  re-check:     P1 shows `authenticated` holds privileges on storage (25 tables) and realtime (4 tables). A leaked
                app_owner secret therefore reaches them as far as an authenticated user with chosen claims — the same
                as a leaked app_server secret; before, R1's reason was "the product schema only". Nil today: Storage
                and Realtime are unused. When M1 picks Supabase Storage or Realtime is adopted, DATA ARCHITECT
                re-evaluates a narrower path; if app_owner could act as users over stored media (which may include
                images of minors), it goes to Afik (reserved item 4).
  deferred:     the anchor's ON DELETE action — decided with the first table against retention (§13.4); reserved for
                Afik if it touches data about minors.
  alternatives: L2 — a product-schema function reading request.jwt.claims (a second definition of the current user
                that can drift from auth.uid(), four rules reworded, unprobed) · granting `anon` (narrower, untested) ·
                postgres creating every policy (reverses R1). L1 — a trigger on auth.users (a SECURITY DEFINER
                exception, still a postgres step) · the server deleting data then calling the Auth admin API (not
                atomic, needs the service-role key) · a periodic orphan sweep (orphans persist until it runs).
  security:     not a change to the security model: RLS stays the only enforcement point, no role bypasses it, FORCE
                RLS on every table, app_owner never runs at runtime, no row becomes readable to anyone new.
  decided by:   ORCHESTRATOR (11.10.2026, under "Working rules"; DATA ARCHITECT's recommendation, probes passed)

2026-10-11 | UI wave 1 (9.7) Gate 1: five shared components join SRS §4.2; Button gets a pending state
  source:       .work/ui-wave-1/spec.md (SPEC), DR-1 and DR-2, approved at Gate 1
  DR-1:         AuthLayout (Shared Layout), FormField, Checkbox, InlineAlert and Logo (Shared UI) are added to SRS §4.2
                (version 2.11). The approved R2 screens need them; they are shared UI, not a feature, and change no
                behaviour the SRS describes.
  DR-2:         Button gets a pending state in wave 1: the label stays, a small loader icon at the inline start,
                aria-busy="true", focusable and not disabled, activation while pending does not call the handler, no
                spin under reduced motion. Reason: every I1 form submits; a disabled submit and a centred spinner are
                both banned (direction.md), and ignoring repeat activation prevents a double submit (a CRITIC check).
  questions:    Q1–Q3 accepted as stated: arbitrary values rejected everywhere, data-/aria- state variants allowed,
                [&…] selector variants only in components/ui · SelectInput is a native <select> · story screenshots
                are added by TEST ENGINEER in part f.
  alternatives: DR-1 — keep the five as unlisted helpers (a gap between the SRS and the code) · DR-2 — ship Button
                without pending and let F1.3–F1.5 raise it (each form would invent its own)
  decided by:   ORCHESTRATOR (11.10.2026, Gate 1 under "Working rules")

2026-10-11 | GitHub environments for migrations are `db-preview` and `db-production`; T7 passed
  updates:      2026-10-11 "Migration path, migration role, Data API and pre-migration tests" — its environments
                `preview` and `production` are renamed. Vercel already created GitHub environments named Preview and
                Production for its deployments, and GitHub environment names are case-insensitive, so the migration
                environments need their own names.
  rule:         `db-production` — required reviewer Afik, deployment branches `main` only; holds only the nestly-prod
                migration connection string (app_owner). `db-preview` — no reviewer; holds only the nestly-preview
                one. Vercel's Preview and Production environments are left as Vercel made them.
  t7:           on nestly-preview with the Data API off — /rest/v1/ refused (401), a table path and /graphql/v1 refused
                (503, PGRST002: no schema cache), /auth/v1/health and /auth/v1/settings 200. Sign-in is unaffected, so
                the Data API is also turned off on nestly-prod (Afik, dashboard).
  alternatives: reuse Vercel's Production environment for migrations (mixes deploy approvals with database writes and
                ties migration secrets to an environment another integration manages)
  decided by:   ORCHESTRATOR (11.10.2026, names proposed by Afik)

2026-10-12 | The guard keeps a single record: incidents.md
  rule:         `guard.js` reports a block to `incidents.md` only. It writes no second log and loads no other module —
                a short-lived change that also wrote a separate event log (12.10) was removed the same day at Afik's
                request, with its tests; the guard depends on nothing outside its own file. At the same request, the
                log entries that described that change were removed from this file and the other logs rather than marked
                superseded; git history keeps them.
  kept:         the TEST ENGINEER rule strips plain shell expansions ($?, $X, ${X}) before judging a path; an expansion
                with an operator (${X:-…}) stays a glob. Found and fixed through two CRITIC rounds on opus (12.10);
                the remaining text-not-semantics gap is in debt.md.
  history:      not rewritten. The change's branch was deleted from GitHub by Afik and locally (12.10); its commits
                stay in main's history.
  alternatives: keep the second log behind a lazy, fail-closed require (rejected: Afik wants no dependency) ·
                rewrite history to remove the commits (rejected by Afik: a force push to a public repo for no gain)
  decided by:   Afik (12.10.2026)

2026-10-12 | UI wave 1 (9.7) spec addenda after Gate 1, parts c–e — recorded together
  source:       `.work/ui-wave-1/spec.md` (each addendum in the API section, dated) and `.work/ui-wave-1/findings.md`
  props:        form controls (TextInput, PasswordInput, SelectInput, Checkbox) accept exactly the spec's props — no
                `className`, no native passthrough; display and layout components accept `className` for placement only
                (margin, alignment, flex/grid item, max width); variation is a prop (e.g. Avatar `size`).
  errors:       errors are announced, not only drawn: ChoiceCardGroup is a `radiogroup` with `aria-invalid` and an
                `aria-describedby` prop; DateInput and Checkbox take `aria-describedby`; `error` and `aria-invalid`
                combine. PasswordInput rule state is spoken ("(התקיים)" / "(עדיין לא)"), the ✓ is `aria-hidden`.
  layout:       the password toggle never overlaps the LTR text in an RTL page · SelectInput's placeholder is muted
                (by state; the arbitrary-value lint rejects `has-[…]`).
  target size:  a link inline in a sentence — inside a `p` or a checkbox/radio `label`, wrapper spans looked through,
                with text outside every link and button — is exempt from 44×44 (WCAG 2.5.8); nothing else is.
  copy:         story copy follows decided requirements only (VAL-003 ten characters; OP-004 options; FR-AUTH-003
                recovery link on Login; FR-AUTH-001 Welcome lead).
  components:   MenuItem takes exactly one of `href` or `onClick`; a disabled link keeps its `href`, stays focusable and
                cancels activation · Avatar initials by first grapheme of letter-led words, upper-cased; empty name →
                `aria-hidden` · Logo's name is fixed ("Nestly") · the Registration illustration follows the R2 heart;
                leaves keep the `success` token (decorative; no new token).
  alternatives: native passthrough on all controls (rejected: placeholder-as-label becomes type-legal) · a decorative
                `illustration-green` token (rejected: a token for one decoration) · a stand-alone link next to a label
                exempt from target size (rejected: not a sentence).
  decided by:   ORCHESTRATOR (11–12.10.2026, under "Working rules"), from CRITIC and TEST ENGINEER findings

2026-10-12 | No merge to `main` without green CI on GitHub — a standing rule (workflow.md 1.7)
  rule:         every change reaches `main` through a PR, merged only when every GitHub Actions check on its latest
                commit is green. A local `npm test` / `npm run ci` is never the gate. ORCHESTRATOR opens the PR itself
                with `gh` and reads the checks there.
  why:          `ci.yml` failed on GitHub for runs 1–22 (7.2 to 12.10) while each merge was reported "CI green" from a
                local Windows run. Cause: one guard test (`guard.test.js:245`, `NOTES~1.MD`) relied on `fold()`
                lowercasing, which happens only on win32; the runner is Linux. Fixed in PR 1 (`guard.js:509`, `/i`).
                Every red run had that one failure and no other (checked with `gh run view --log-failed`, 12.10).
  alternatives: keep local runs as the gate with the GitHub result as advisory (rejected: that is how 22 red runs
                went unnoticed) · run CI locally in a Linux container (rejected: no Docker or WSL here, and it would
                still not be the runner)
  accepted cost: every merge waits for the GitHub run, a few minutes per PR.
  decided by:   Afik (12.10.2026)

2026-10-12 | UI wave 1 (9.7) spec addenda, part f — recorded together
  source:       `.work/ui-wave-1/spec.md` ("Addendum during part f", "Addendum after the part-f review") and
                `.work/ui-wave-1/findings.md` (Part f)
  layout:       BottomNavigation's position comes from its container; its standalone stories use a full-height page
                frame · from 1024 the content column is centred beside the rail (R2 desktop) · scrolled or focused
                content is never entirely hidden behind the TopBar or the nav (WCAG 2.4.11)
  behaviour:    AppShell returns focus to the Hamburger on close even if it was not focused at open · only the first
                `current` nav item is current · with the close control focused, the first Escape may close its Tooltip
                (WCAG 1.4.13) · AppShell accepts `className` for placement · closing the drawer on menu-item activation
                is decided with the router in I1
  alternatives: BottomNavigation `position: fixed` (rejected: breaks the rail from 1024) · enforcing "one current" by
                type (rejected: not expressible for an array without cost) · moving the nav after `main` in the DOM
                (rejected by CRITIC's reading: it moves the order mismatch to 1024; the skip link covers it)
  decided by:   ORCHESTRATOR (12.10.2026, under "Working rules"), from TEST ENGINEER and CRITIC findings

---

## Pending — not yet decided

~~**Type checking via JSDoc.**~~ **Closed 2026-10-11** — superseded by the decision to write all product
code in TypeScript (entry "Rule 0 reopened").

~~**First initiative.**~~ **Closed 2026-10-11** — the roadmap and the MVP are decided (entry "D7 closed").

**Media decisions M1–M6.** Before I5 — storage provider, formats and limits, policy for images of minors, EXIF
stripping, hash scanning, retention (entry "D7 closed").

~~**GitHub remote.**~~ **Closed 2026-10-11** — github.com/afikyermi/Nestly, public (entry "GitHub remote").

~~**Migration path.**~~ **Closed 2026-10-11** — CI over the session-mode pooler (entry "Migration path, migration role…"). Was: in 7.3 — the direct connection is IPv6 only; DATA ARCHITECT decides between the session-mode
pooler and the IPv4 add-on (entry "Hosting").

~~**Sharing in the SRS.**~~ **Closed 2026-10-11** — approved (entry "Sharing defined"); it enters SRS 2.9.

**Design choices at the review rounds.** The Reaction's name at R2. Palette, font, desktop layout and the eighth
tracker tile were decided on 11.10.2026 (entries "R1" and "The eighth tracker tile").

**Open product points** are tracked in the SRS itself: `docs/srs/appendix-b-open-points.md` (OP-xxx),
plus every "TBD" or "נדרש אישור" in the section files. They are product decisions, so they belong there.
