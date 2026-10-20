// The Intent Signal's topic detection (FR-ALG-008; Afik 20.10.2026): fixed rules, words to a topic, no model. Only the topic is kept,
// never the typed text. A search with no matching word has no topic and stores nothing. The topic names are the keys of the shared
// product categories the feed, the Marketplace and the consultants will rank by.
//
// A rule is a word that must start a word of the text: after the start of the text or a character that is no letter or digit, with up to
// two Hebrew prefix letters (ו, ה, ב, ל, מ, ש, כ) in front of it, so "חום" is not found inside "תחום" and "play" not inside "display". A
// rule ending in `*` is a stem and may continue ("הריו*" finds "הריון" and "הריונות": a Hebrew final letter changes inside a word); any other rule must end the word. The same pattern runs in
// the browser-free shared code (detectTopics) and in the feed's SQL (`~*`, POSIX ARE), so it uses only syntax both read alike.

/** topic -> its words (Hebrew and English). Lower case; a trailing `*` marks a stem. */
export const TOPIC_RULES: Readonly<Record<string, readonly string[]>> = {
  pregnancy_planning: ['תכנון הריון', 'ניסיון להרות', 'להיכנס להריון', 'ביוץ*', 'מחזור חודשי', 'מחזור לא סדיר', 'trying to conceive', 'ovulation'],
  fertility: ['פוריות', 'טיפולי פוריות', 'הפריה', 'fertility', 'ivf'],
  pregnancy: ['הריו*', 'שבוע הריון', 'בדיקת שקיפות', 'סקירת מערכות', 'pregnan*'],
  birth: ['לידה', 'ללדת', 'צירים', 'חדר לידה', 'דולה', 'קיסרי*', 'giving birth', 'birth plan', 'childbirth'],
  postpartum: ['אחרי לידה', 'התאוששות', 'דיכאון אחרי לידה', 'postpartum'],
  breastfeeding: ['הנקה', 'להניק', 'יועצת הנקה', 'משאבת חלב', 'breastfeed*'],
  nutrition: ['תזונה', 'האכלה', 'מוצקים', 'תחליף חלב', 'פורמולה', 'אוכל לתינוק', 'nutrition'],
  sleep: ['שינה', 'לישון', 'התעוררויות', 'הרדמה', 'sleep*'],
  baby_gear: ['עגלה', 'עגלת*', 'כיסא בטיחות', 'כסא בטיחות', 'מנשא', 'מיטת תינוק', 'עריסה', 'מוצץ', 'stroller*', 'car seat*'],
  baby_health: ['חיסון*', 'חום גבוה', 'חום לתינוק', 'קוליק*', 'רופא ילדים', 'רופאת ילדים', 'שיעול', 'אלרגי*', 'טיפת חלב'],
  development: ['התפתחות', 'זחילה', 'צמיחת שיניים', 'אבני דרך', 'התפתחות דיבור'],
  mental_health: ['חרדה', 'דיכאון', 'לחץ נפשי', 'טיפול נפשי', 'פסיכולוג*'],
  toys_and_play: ['צעצוע*', 'משחקים', 'חוגים', 'גן ילדים', 'toys', 'play'],
  family_finance: ['דמי לידה', 'ביטוח לאומי', 'חופשת לידה', 'מענק*', 'משכנתא'],
};

/** No letter or digit: the edge of a word (Hebrew, Latin, digits). */
const EDGE = '[^א-תa-z0-9]';
const PREFIXES = '[והבלמשכ]{0,2}';

function escapeRegex(word: string): string {
  return word.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`);
}

/** The pattern of one topic, as source text for a case-insensitive match (JavaScript `i`, PostgreSQL `~*`). */
export function topicPatternSource(topic: string): string {
  const words = TOPIC_RULES[topic] ?? [];
  const alternatives = words.map((rule) =>
    rule.endsWith('*') ? escapeRegex(rule.slice(0, -1)) : `${escapeRegex(rule)}(?:$|${EDGE})`,
  );
  return `(?:^|${EDGE})${PREFIXES}(?:${alternatives.join('|')})`;
}

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = Object.keys(TOPIC_RULES).map(
  (topic) => [topic, new RegExp(topicPatternSource(topic), 'i')] as const,
);

/** The topics (zero or more, in a fixed order) the text means. */
export function detectTopics(text: string): string[] {
  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

/** The most topics one search stores. */
export const MAX_TOPICS_PER_SEARCH = 3;
