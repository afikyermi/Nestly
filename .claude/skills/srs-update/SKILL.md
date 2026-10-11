---
name: srs-update
description: Updates the Nestly SRS after a change — the right section file in its own format, IDs continuing the sequence, open items kept open, a version row, the AC names file, §17 and the rebuilt INDEX. Use for an SRS change outside a feature, as `/srs-update <what changed>`; inside a feature, /wrap-up follows these steps.
disable-model-invocation: true
argument-hint: <what changed, and Afik's decision it rests on>
---

# /srs-update — keep the SRS true

**Version:** 1.0 · the rules are in `CLAUDE.md` → "Product requirements — the SRS". This is their procedure.

## Input

`$ARGUMENTS` — what changed in the product, and the decision of Afik's it rests on.

## Steps

1. **Locate.** Find the right section file through `docs/srs/INDEX.md` (`srs-lookup` method). A change can touch
   several files — an FR, its BR, VAL, ERR and AC, and the entities in §13.
2. **Write in the document's own logic.** The section's table format and wording style. A new ID continues its
   prefix's sequence — take the last ID from the INDEX ranges. Never renumber.
3. **Keep open items open.** Anything Afik has not decided stays "TBD" or "נדרש אישור", with an OP row in
   `appendix-b-open-points.md`. Never write a default into the SRS.
4. **Traceability.** When pages, FRs or entities changed, update `17-traceability.md`. A new AC gets its short name
   in `tools/srs-ac-names.json` first, or the INDEX build fails.
5. **Version.** One minor version per batch of changes: bump it in `00-document-info.md` and add one row to the
   change history, listing the IDs touched.
6. **Rebuild** with `node tools/build-srs-index.js`. It must pass.

Never touch `docs/srs/archive/` or `exports/`.

## Stop conditions

- The change needs a decision Afik has not made → `DECISION REQUEST`. Write nothing until he answers.
- The INDEX build fails → fix the cause (a missing AC name, a duplicate ID, a broken link). Never edit `INDEX.md`
  by hand.

## Done when

The build passes · the history row names every ID touched · `git diff` shows only SRS files and
`tools/srs-ac-names.json`.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
