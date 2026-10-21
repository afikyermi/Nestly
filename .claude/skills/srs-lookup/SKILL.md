---
name: srs-lookup
description: Finds and cites Nestly SRS requirements — FR, AC, BR, VAL, ERR, NFR, OP — through the INDEX, reading only the lines needed, and flags open items. Also writes an initiative's Brief (.work/briefs/<initiative>.md) before every initiative or completion. Use whenever work needs a requirement ID, its exact wording, the items linked to it, or a brief.
user-invocable: false
---

# srs-lookup — find it, cite it, never load the whole SRS

**Version:** 1.2 · the rule is in `CLAUDE.md` → "Sources". This is the method.

## Steps

1. **Start at `docs/srs/INDEX.md`.** It maps every section file, every FR and AC to its file, and the ID range of
   every prefix to its file. The INDEX is authoritative. Do not guess a file from memory.
2. **Grep, then read narrowly.** Search for the ID across `docs/srs/` — that shows its definition and every place
   that references it. Read the definition's table row or section, not the whole file.
3. **Collect what belongs to an FR.** The BR, VAL, ERR and AC items that cite it or that it cites, and its row in
   `17-traceability.md` (pages, use cases, entities).
4. **Read the status.** "מאושר" is decided. "TBD", "נדרש אישור", "פתוח", or an open OP in
   `appendix-b-open-points.md` is an open question: build per its ⭐ (the recommended option), add or keep an OP row
   "built per ⭐, awaiting confirmation", and add a line to WORKPLAN "ממתין לך". Never block on it.
5. **Cite** as `ID (file)` — for example `FR-FEED-005 (05-functional/feed.md)`. Quote at most one line. The SRS is
   in Hebrew; IDs and product terms stay as written.

## Brief

Before every initiative or completion, in a separate subagent, write `.work/briefs/<initiative>.md` (git-ignored),
at most ~170 lines, from the initiative map (`decisions-in-force.md` §5), the SRS via the INDEX and the decisions.
The builder works from it; `done-check` checks the PR against it. Sections:
- **(a) Requirements** — per FR / BR / AC / VAL / ERR / PG: `ID (file) — what has to happen · how we know it works`.
- **(b) Afik's decisions** — the whole of `decisions-in-force.md`, not only the initiative's §: every cross-cutting
  decision that touches it (a 500-character free-text field and "אחר" in every report, a relative time on every
  publication, staff principles, rating display…), one line each by §. When the SRS and a decision contradict each
  other, the decision wins; list the contradiction so the SRS is updated in the same PR.
- **(c) Fixed rules** — staff principles §9–§10; retention per SRS §13.4 (who deletes, when it runs); Audit (which
  actions write it); children's data; the strict-query trap (#147: a strict query schema accepts Vercel's `path`).
- **(d) Open** — every open item with its ⭐; built per the ⭐ with an OP row and a WORKPLAN line.
- **(e) Definition of done** — pgTAP, server tests, an e2e-preview flow for the main flow (`e2e-preview/README.md`),
  SRS updated, a status row in `17-traceability.md` for every FR touched.
- **(f) Users and experience** — per user type touched (Regular, Professional, Moderator, Admin): what they see, do
  and would expect to find, by how successful social networks work and `CLAUDE.md` → "Product". A bad experience →
  a line in WORKPLAN "ממתין לך" with a suggestion.

## Stop / done

- An ID not in the INDEX → say so, with the search terms used; never invent one. Behaviour not in the SRS at all →
  a specification gap: report it, never phrase it as a requirement.
- Done: every claim carries `ID (file)`, every open item flagged, no file read in full where a section would do; a
  brief has all six sections. Changelog: 1.0 (11.10) created · 1.1 (21.10) the Brief, open items per ⭐ · 1.2 (21.10)
  (b) reads all decisions, a decision beats the SRS; (f) Users and experience (Afik).
