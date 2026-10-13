// The one definition of a builder's notes file name (CRITIC never reads it): notes.md in any case, a lookalike with a
// suffix (notes.md.orig, notes.md.) or a Windows short name (notes~1.md). Matched against a basename.
// Imported by guard.js and tools/critic-diff.mjs. No side effects.
'use strict';

const NOTES_NAME = /^(notes\.md(\..*)?|notes~\d+\.md)$/i;

module.exports = { NOTES_NAME };
