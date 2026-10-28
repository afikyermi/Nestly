// The Nestly assistant (Afik 28.10.2026; FR-AI-001, BR-092, VAL-053, ERR-055). Limits and the urgent-words safety net, held once here: the web and
// the server read the same values.

/** The longest message a user sends the assistant, in code points (VAL-053). */
export const ASSISTANT_TEXT_MAX = 1000;

/** The longest earlier answer sent back as context, in code points: an answer is bounded by the model, this bounds what a client may claim. */
export const ASSISTANT_ANSWER_MAX = 4000;

/** How many earlier messages of the same conversation (the user's and the assistant's) go with a new one (NFR-PRIV-008). */
export const ASSISTANT_HISTORY_MAX = 6;

/** Default limits per account (BR-092); the server's configuration may set others. */
export const ASSISTANT_PER_HOUR = 20;
export const ASSISTANT_PER_DAY = 60;

/**
 * Words that mean a possible emergency (BR-093). A message holding any of them shows the urgent banner, whatever the model answers or
 * whether it answers at all. Matched as substrings after niqqud and repeated spaces are removed, so a prefix ("ו", "ה", "ש") still matches.
 */
export const ASSISTANT_URGENT_PHRASES: readonly string[] = [
  'דימום',
  'מדמם',
  'מדממת',
  'דם רב',
  'לא נושם',
  'לא נושמת',
  'מתקשה לנשום',
  'מתקשה בנשימה',
  'קשיי נשימה',
  'קושי לנשום',
  'הפסיק לנשום',
  'הפסיקה לנשום',
  'נחנק',
  'נחנקה',
  'הכחיל',
  'הכחילה',
  'כחול בשפתיים',
  'שפתיים כחולות',
  'חום גבוה',
  'פרכוס',
  'פרכוסים',
  'עוויתות',
  'איבד הכרה',
  'איבדה הכרה',
  'איבוד הכרה',
  'מחוסר הכרה',
  'לא מגיב',
  'לא מגיבה',
  'לא מתעורר',
  'לא מתעוררת',
  'ירידת מים',
  'ירדו המים',
  'ירדו לי המים',
  'לא מרגישה תנועות',
  'אין תנועות',
  'הפסיק לזוז',
  'כאב חזק בבטן',
  'כאבים חזקים בבטן',
  'נפל על הראש',
  'נפלה על הראש',
  'בלע סוללה',
  'בלעה סוללה',
  'בלע מגנט',
  'בלעה מגנט',
  'הרעלה',
  'כוויה',
  'רוצה למות',
  'לפגוע בעצמי',
  'לפגוע בתינוק',
];

// Cantillation and vowel points only: the maqaf (U+05BE) and the punctuation marks (U+05C0, U+05C3, U+05C6) join or end words, so they become spaces.
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;
const HEBREW_PUNCTUATION = /[־׀׃׆]/g;

function normalize(text: string): string {
  return text.replace(NIQQUD, '').replace(HEBREW_PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();
}

/** Whether a message holds an urgent phrase (BR-093). Independent of the model: the banner never waits for an answer. */
export function isUrgentAssistantText(text: string): boolean {
  const value = normalize(text);
  return ASSISTANT_URGENT_PHRASES.some((phrase) => value.includes(phrase));
}
