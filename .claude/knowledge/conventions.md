# Conventions — as-built

**Proposed by:** BUILDER. **Validated by:** CRITIC or DATA ARCHITECT. A convention enters only after
a validator other than its proposer has confirmed it.
**Status:** empty. No code exists yet.

---

## Promotion rule

A convention enters this file when it has been **used and validated**, not when it has been proposed.

**Never promote:** hypotheses · rejected alternatives · unapproved recommendations · temporary
workarounds · unvalidated claims.

A convention here is binding on BUILDER. That is the point — and it is also why the bar for entry
is a second pair of eyes.

---

## Stack — fixed

| Layer | Choice | Status |
|---|---|---|
| Language | **JavaScript** | 🔒 **IRON RULE** — no TypeScript |
| UI | **React** | 🔒 IRON RULE |
| Styling | **Tailwind** | decided |
| Markup | JSX (React's form of HTML) | 🔒 IRON RULE |
| Database | **PostgreSQL**, single source of truth | decided |
| Platform | **Supabase** — Postgres, auth, storage, realtime | decided |
| Authorization | **RLS**, enforced in the database | decided |
| Server-side code | Supabase Edge Functions, JavaScript — only where a secret is required | decided |
| Tests | JavaScript. Playwright for end-to-end. SQL for database tests | decided |
| Files | **in the repo.** Tests never ship, but they are always versioned | decided |

Reasoning for each: `decisions.md`.

---

## The consequence that shapes everything below

> **There is no compile-time typecheck.**

A misspelled field, a property that does not exist, a call to a function that was never written —
none of these are caught before the code runs. The defences that remain:

| Defence | Carries |
|---|---|
| the database schema | the only place the *system* says "this does not exist" |
| tests | behaviour, and the existence of what they exercise |
| CRITIC | must actively verify that referenced symbols, imports and fields exist |
| conventions below | consistency, so that a wrong name is visible as wrong |

**This is why naming conventions matter more here than in a typed project.** In a typed codebase a
wrong name is a compiler error. Here it is a runtime crash, possibly on a rare path, possibly in
front of a user. A convention that makes names predictable is a real safety mechanism, not tidiness.

---

## Conventions

*none yet*

Each entry:

```
### <area>
rule:     what to do
why:      the reason — without this, the rule gets cargo-culted or discarded
example:  path/to/file.ts:NN
added:    YYYY-MM-DD, validated by <agent>
```

Areas expected to accumulate entries: file and directory layout · naming · error handling and error
shape · validation at trust boundaries · data access patterns · component structure · loading and
empty states · test layout and naming · logging.

---

## Retired

A convention that stopped being true moves here with the date and the reason, rather than being
deleted. A convention that silently disappears leaves code that nobody can explain.
