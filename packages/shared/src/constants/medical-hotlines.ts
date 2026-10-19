// The medical hotlines page (I3 F3.8; FR-MENU-002, AC-109, PG-047; §12 "Medical hotlines": `tel:` only, no integration, no data). The only
// home of the names and numbers: the page and every test read this list, and it changes only by a code change. Order (spec c1): MDA, then
// the four HMOs in Hebrew alphabetical order (כללית, לאומית, מאוחדת, מכבי; no HMO favoured). Every number is verified against an official
// source at build time and the source and date are recorded in .work/medical-hotlines/notes.md; no number from memory, no placeholder.
// Labels follow screen.md: "<HMO> — מוקד אחיות"; an HMO whose official site lists no nurse line carries what that site calls its 24/7 line
// (DR-1). All five lines are 24/7 on their sources, so no hours are shown (spec Q3).

export interface MedicalHotline {
  /** Stable id, for tests and keys. */
  readonly id: 'mda' | 'clalit' | 'leumit' | 'meuhedet' | 'maccabi';
  /** The visible service name (screen.md). */
  readonly label: string;
  /** What is dialled: digits, with a leading `*` or `+` only; `href` is `tel:` + this, exactly. */
  readonly number: string;
}

export const MEDICAL_HOTLINES: readonly MedicalHotline[] = [
  { id: 'mda', label: 'מד"א', number: '101' },
  { id: 'clalit', label: 'כללית — מוקד אחיות', number: '*2700' },
  { id: 'leumit', label: 'לאומית — מוקד אחיות', number: '*507' },
  { id: 'meuhedet', label: 'מאוחדת — מוקד טלפוני 24/7', number: '*3833' },
  { id: 'maccabi', label: 'מכבי — מוקד אחיות', number: '*3555' },
];
