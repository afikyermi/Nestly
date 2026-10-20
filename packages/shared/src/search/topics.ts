// The Intent Signal's topic detection (FR-ALG-008; Afik 20.10.2026): fixed rules, words to a topic, no model. Only the topic is kept,
// never the typed text. A search with no matching word has no topic and stores nothing. The topic names are the keys of the shared
// product categories the feed, the Marketplace and the consultants will rank by.

/** topic -> the word stems that mean it (Hebrew and English), matched anywhere in the lower-cased text. */
export const TOPIC_RULES: Readonly<Record<string, readonly string[]>> = {
  pregnancy_planning: ['תכנון הריון', 'ניסיון להרות', 'להיכנס להריון', 'ביוץ', 'מחזור', 'trying to conceive'],
  fertility: ['פוריות', 'טיפולי פוריות', 'הפריה', 'fertility', 'ivf'],
  pregnancy: ['הריון', 'בהריון', 'שבוע ', 'בדיקת שקיפות', 'סקירת מערכות', 'pregnan'],
  birth: ['לידה', 'ללדת', 'צירים', 'חדר לידה', 'דולה', 'קיסרי', 'birth'],
  postpartum: ['אחרי לידה', 'התאוששות', 'דיכאון אחרי', 'postpartum'],
  breastfeeding: ['הנקה', 'להניק', 'יועצת הנקה', 'משאבה', 'breastfeed'],
  nutrition: ['תזונה', 'האכלה', 'מוצקים', 'תחליף חלב', 'פורמולה', 'אוכל לתינוק', 'nutrition'],
  sleep: ['שינה', 'לישון', 'התעוררויות', 'הרדמה', 'sleep'],
  baby_gear: ['עגלה', 'כיסא בטיחות', 'כסא בטיחות', 'מנשא', 'מיטת תינוק', 'עריסה', 'מוצץ', 'stroller', 'car seat'],
  baby_health: ['חיסון', 'חום', 'קוליק', 'רופא ילדים', 'שיעול', 'אלרגיה', 'טיפת חלב'],
  development: ['התפתחות', 'זחילה', 'הליכה', 'שיניים', 'דיבור', 'אבני דרך'],
  mental_health: ['חרדה', 'דיכאון', 'לחץ נפשי', 'טיפול נפשי', 'פסיכולוג'],
  toys_and_play: ['צעצוע', 'משחק', 'חוגים', 'גן ילדים', 'play'],
  family_finance: ['דמי לידה', 'ביטוח לאומי', 'חופשת לידה', 'מענקים', 'משכנתא'],
};

/** The topics (zero or more, in a fixed order) the text means. */
export function detectTopics(text: string): string[] {
  const haystack = text.toLowerCase();
  return Object.entries(TOPIC_RULES)
    .filter(([, words]) => words.some((word) => haystack.includes(word.toLowerCase())))
    .map(([topic]) => topic);
}

/** The most topics one search stores. */
export const MAX_TOPICS_PER_SEARCH = 3;
