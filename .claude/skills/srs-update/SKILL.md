---
name: srs-update
description: Updates the Nestly SRS after a change — the right section file in its own format, IDs continuing the sequence, open items kept open, a version row, the AC names file, §17 and the rebuilt INDEX. Use for an SRS change outside a feature, as `/srs-update <what changed>`; inside a feature, the builder follows these steps in the same PR.
disable-model-invocation: true
argument-hint: <what changed, and Afik's decision it rests on>
---

# /srs-update — keep the SRS true

**Version:** 1.1 · the rules are in `CLAUDE.md` → "Sources" and `.claude/rules/srs-editing.md`. This is their procedure.

## Input

`$ARGUMENTS` — what changed in the product, and the decision of Afik's it rests on.

## Steps

1. **Locate.** Find the right section file through `docs/srs/INDEX.md` (`srs-lookup` method). A change can touch
   several files — an FR, its BR, VAL, ERR and AC, and the entities in §13.
2. **Write in the document's own logic.** The section's table format and wording style. A new ID continues its
   prefix's sequence — take the last ID from the INDEX ranges. Never renumber.
3. **WHAT, not HOW.** The SRS states what the product does: no table or column names, functions, endpoints,
   algorithms, storage layout or internal codes. Technology choices (Supabase, Vercel, NudeNet…) are fine.
4. **Decisions and open items.** Every decision of Afik's that the change rests on is written into the SRS in the
   same PR, and its line leaves `decisions-in-force.md`. A question Afik has not answered: build per its ⭐, and the
   SRS gets an OP row in `appendix-b-open-points.md` "built per ⭐, awaiting confirmation", plus a line in WORKPLAN
   "ממתין לך".
5. **Traceability.** When pages, FRs or entities changed, update `17-traceability.md`. Every FR changed gets a
   status row there: Built / Partial / Planned + the initiative. A new AC gets its short name in
   `tools/srs-ac-names.json` first, or the INDEX build fails.
6. **Version.** One minor version per batch of changes: bump it in `00-document-info.md` and add one row to the
   change history, listing the IDs touched.
7. **Rebuild** with `node tools/build-srs-index.js`. It must pass.

Never touch `docs/srs/archive/` or `exports/`.

## Stop conditions

- The change needs a decision Afik has not made → build per the ⭐ (step 4); never block on it.
- The INDEX build fails → fix the cause (a missing AC name, a duplicate ID, a broken link). Never edit `INDEX.md`
  by hand.

## Done when

The build passes · the history row names every ID touched · `git diff` shows only SRS files and
`tools/srs-ac-names.json`.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision).
- 1.1 — 2026-10-21 — WHAT not HOW; decisions move into the SRS; FR status rows; ⭐ defaults as OP rows (Afik).
