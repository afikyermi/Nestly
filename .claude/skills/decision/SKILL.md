---
name: decision
description: Records a decision Afik made in decisions.md, in the fixed format, naming every earlier entry it supersedes, updates or extends. Use when Afik states a decision, as `/decision <the decision>`.
disable-model-invocation: true
argument-hint: <the decision, in Afik's words>
---

# /decision — record it once, correctly

**Version:** 1.0 · the format is at the top of `decisions.md`. The file is append-only.

## Input

`$ARGUMENTS` — the decision, in Afik's words.

## Steps

1. **Confirm it is Afik's.** Quote his words. A recommendation he has not accepted is not a decision.
2. **Find what it touches.** Search `decisions.md` for related entries (titles and `rule:` lines) and the
   Pending list.
3. **Append the entry** before the `---` that precedes "Pending", in the header format, plus one of
   `supersedes:`, `updates:` or `extends:` naming each affected entry by date and title. Never edit or delete an
   earlier entry. A Pending item it settles is marked closed, with a pointer to the new entry.
4. **Where else it belongs:**
   - product behaviour, or a technical decision the SRS has a place for → tell Afik that `/srs-update` is needed
   - a change to the agent team → the affected file in `.claude/`
   - an item WORKPLAN tracks → the WORKPLAN line
5. **Commit** with explicit paths, `Implements: none — decision` and the attribution line.

## Stop conditions

- Afik did not explicitly make the decision → do not record it.
- It contradicts an entry and Afik did not say it replaces that entry → ask which stands.

## Done when

The entry is appended, every affected entry is named, and a search finds no second entry for the same decision.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
