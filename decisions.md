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

2026-09-12 | Tests live in the repo, in JavaScript, plus SQL for database tests
  alternatives: tests in another language (Python/Java bindings) · tests kept outside the repo
  why:          unit tests import the code and therefore cannot be in another language at all. For
                end-to-end the best tool is Playwright, whose native home is JavaScript — other
                language bindings are a translation of the same tool, so there is zero capability
                gain and a real cost in a second toolchain every agent must know. Tests never ship to
                production in any language, so that condition is already satisfied. Tests outside the
                repo were rejected: they do not run in CI, are not versioned, and rot silently into
                tests that stopped existing without anyone noticing.
  decided by:   Afik

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

---

## Pending — not yet decided

**Type checking via JSDoc.** Plain `.js` files with typed comments and a `jsconfig.json` recover much
of what the iron rule gives up — misspelled fields, wrong argument types, calls to functions that do
not exist. No `.ts` files, no compiled output; the shipped code is exactly the code written. The
honest caveat: the checker itself is the TypeScript compiler in check-only mode, so Afik must decide
whether that violates the spirit of the rule. A weaker, entirely free version is `jsconfig.json`
alone, with no JSDoc, which still catches some errors from library-provided types.
**Not adopted. Awaiting Afik.**

**First initiative.** Assumed to be accounts + profile + stage, since everything depends on it.
Not confirmed.

**Product decisions, to be resolved in the SRS.** Anonymity · community content visibility · My Stage
segmentation and entry/exit points · whether both parents are treated identically · professional
verification · moderation model · Preliminary Conversation realtime or async · feed chronological or
ranked · Booking Commitment and Lead pricing · Brands as a third account type · the name.
See `open-questions.md`. None of these change the database paradigm.
