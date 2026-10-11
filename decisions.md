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

---

## Pending — not yet decided

~~**Type checking via JSDoc.**~~ **Closed 2026-10-11** — superseded by the decision to write all product
code in TypeScript (entry "Rule 0 reopened").

**First initiative.** Deferred by Afik (D7, 10.10.2026) until a structured plan is made.

**Design choices at the review rounds.** Palette, Hebrew font and desktop layout at R1; the Reaction's name at R2;
the eighth tracker tile (OP-007). See the 2026-10-11 design entries.

**Open product points** are tracked in the SRS itself: `docs/srs/appendix-b-open-points.md` (OP-xxx),
plus every "TBD" or "נדרש אישור" in the section files. They are product decisions, so they belong there.
