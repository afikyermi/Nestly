---
name: decision
description: Records a decision Afik made — the full entry in decisions/<YYYY-MM>.md and one line in the "In force" index of decisions.md, naming every earlier entry it supersedes, updates or extends. Use when Afik states a decision, as `/decision <the decision>`.
disable-model-invocation: true
argument-hint: <the decision, in Afik's words>
---

# /decision — record it once, correctly

**Version:** 1.2 · the format and the index rules are at the top of `decisions.md`. Full entries are append-only.

## Input

`$ARGUMENTS` — the decision, in Afik's words.

## Steps

1. **Confirm it is Afik's.** Quote his words. A recommendation he has not accepted is not a decision.
2. **Find what it touches.** Read the "In force" and "Superseded" indexes in `decisions.md` and the Pending list;
   for the full text of a related entry, read it in `decisions/<YYYY-MM>.md` or ask SCOUT to search the archive.
3. **Append the entry** at the end of `decisions/<YYYY-MM>.md` of its date (create the month file with the same header
   if it is new), in the header format, plus one of `supersedes:`, `updates:` or `extends:` naming each affected entry
   by date and title. Never edit or delete an earlier entry.
4. **Update the index** in `decisions.md`: one line in "In force". A superseded entry's line moves to "Superseded"
   with a pointer; an updated one gets "upd. <date>". A Pending item it settles is marked closed, with a pointer.
5. **Where else it belongs:**
   - product behaviour, or a technical decision the SRS has a place for → tell Afik that `/srs-update` is needed
   - a change to the agent team → the affected file in `.claude/`
   - an item WORKPLAN tracks → the WORKPLAN line
6. **Commit with the work:** follow workflow → Records and commits. Do not push a separate records
   commit for an active task; a records-only task between features uses its own Light PR.

## Stop conditions

- Afik did not explicitly make the decision → do not record it.
- It contradicts an entry and Afik did not say it replaces that entry → ask which stands.

## Done when

The entry is in the month file, its index line is in "In force", every affected entry is named and moved or marked, and
a search finds no second entry for the same decision.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
- 1.1 — 2026-10-13 — entries go to `decisions/<YYYY-MM>.md` with a line in the index; no commit of its own (Afik,
  agent-slim stage 3).

- P2 — 2026-10-18 — אישור אפיק 17.10: align with canonical authority, sequence and records; no gate removed.
