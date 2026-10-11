---
name: srs-lookup
description: Finds and cites Nestly SRS requirements — FR, AC, BR, VAL, ERR, NFR, OP — through the INDEX, reading only the lines needed, and flags open items. Use whenever work needs a requirement ID, its exact wording, or the items linked to it.
user-invocable: false
---

# srs-lookup — find it, cite it, never load the whole SRS

**Version:** 1.0 · the rule is in `CLAUDE.md` → "Product requirements — the SRS". This is the method.

## Steps

1. **Start at `docs/srs/INDEX.md`.** It maps every section file, every FR and AC to its file, and the ID range of
   every prefix to its file. The INDEX is authoritative. Do not guess a file from memory.
2. **Grep, then read narrowly.** Search for the ID across `docs/srs/` — that shows its definition and every place
   that references it. Read the definition's table row or section, not the whole file.
3. **Collect what belongs to an FR.** The BR, VAL, ERR and AC items that cite it or that it cites, and its row in
   `17-traceability.md` (pages, use cases, entities).
4. **Read the status.** "מאושר" is decided. "TBD", "נדרש אישור", "פתוח", or an open OP in
   `appendix-b-open-points.md` is an open item: a `DECISION REQUEST`, never a default.
5. **Cite** as `ID (file)` — for example `FR-FEED-005 (05-functional/feed.md)`. Quote at most one line. The SRS is
   in Hebrew; IDs and product terms stay as written.

## Stop conditions

- The ID is not in the INDEX → say so, with the search terms used. Never invent an ID.
- The behaviour is not in the SRS at all → that is a specification gap. Report it; do not phrase it as a
  requirement.

## Done when

Every requirement claim carries `ID (file)`, every open item is flagged, and no file was read in full where a
section would do.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
