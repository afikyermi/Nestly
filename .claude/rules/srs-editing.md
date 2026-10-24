---
paths:
  - "docs/srs/**"
  - "tools/srs-ac-names.json"
---

# Editing the SRS

Loaded when a file under `docs/srs/` is read or edited. Moved from `CLAUDE.md` → "Product requirements — the SRS"
on 2026-10-13 (agent-slim stage 3); the rest of that section — the SRS as source of truth, open points never filled,
AI/ML ideas, Word export — stays there. The procedure is `/srs-update`.

- **Follow the document's own structure and writing logic**: the right section file, its table format, its
  ID scheme. New IDs continue the sequence. Never renumber.
- **Versioning**: a minor version per batch of changes, with a row in the change history in
  `00-document-info.md`.
- **After any FR or AC change**, run `node tools/build-srs-index.js`. A new AC also needs a short name in
  `tools/srs-ac-names.json`.
- `docs/srs/archive/` holds old Word versions. History only — never edit them, and never regenerate the
  markdown from them. If Afik hands over an edited Word file, diff it against the markdown first and import
  only his changes, before anyone edits the markdown again.
- **WHAT, not HOW.** The SRS states what the product does, never how it is built: no table or column names,
  functions, endpoints, algorithms, storage layout or internal codes. Technology choices are fine.
- **Afik's decisions go into the SRS** in the same PR that builds them; the line stays in `decisions-in-force.md` with the SRS reference.
- **Every FR changed gets a status row** in `17-traceability.md`: Built / Partial / Planned + the initiative.
- **A ⭐ default** (an open question built per its recommended option) = an OP row in `appendix-b-open-points.md`
  "built per ⭐, awaiting confirmation", and a line in WORKPLAN "ממתין לך".
