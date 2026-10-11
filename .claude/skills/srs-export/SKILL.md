---
name: srs-export
description: Exports the complete current Nestly SRS to a Word document, exports/Nestly_SRS_v<version>.docx. Use when Afik asks for the SRS as Word or .docx.
disable-model-invocation: true
---

# /srs-export — the SRS as Word

**Version:** 1.0 · the tool and its rules are described in `CLAUDE.md` → "Product requirements — the SRS".

## Steps

1. Run `node tools/export-srs-docx.js` from the repository root. If `tools/node_modules` is missing, ask Afik
   before running `npm install` in `tools/`.
2. Confirm that `exports/Nestly_SRS_v<version>.docx` exists, and that its version matches `00-document-info.md`.
3. Give Afik the path.

## Stop conditions

- The tool fails → report the error as it is. Never hand-edit an export: fix the markdown and export again.

## Done when

The file exists, at the current version.

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Provisional until 5 features.
