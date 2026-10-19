// The community rules page's texts (F3.7, PG-049). The eight rules are BR-075's, in its order and wording; what BR-075 says to the SRS reader
// rather than the member is left out (the IDs BR-076 and FR-FEED-005, and "קישור ל-FR-MENU-002", which is the link itself), recorded in notes.md.
export const RULES_TITLE = 'כללי הקהילה'; // also the side menu item and the list's name (screen.md)
export const HOTLINES_LINK_LABEL = 'מוקדי רפואה'; // rule 2's link to the medical hotlines page (F3.8)

export interface CommunityRule {
  readonly title: string;
  /** The rule's sentence after its title; none when the title says it all. */
  readonly text?: string;
}

export const COMMUNITY_RULES: readonly CommunityRule[] = [
  { title: 'כבוד הדדי', text: 'בלי העלבות, שיימינג או בריונות.' },
  { title: 'משתפים ניסיון, לא מאבחנים', text: 'בלי אבחנות ובלי מינון תרופות, ובמצב דחוף פונים לרופא או ל-101.' },
  { title: 'פרטיות', text: 'בלי פרטים מזהים של אחרים, צילומי שיחות או תמונות של ילדים של אחרים בלי רשות.' },
  { title: 'שמירה על ילדים', text: 'בלי תוכן שמסכן ילד; איברים מוצנעים מטושטשים אוטומטית.' },
  { title: 'בלי ספאם ופרסום לא קשור', text: 'פרסום רק ב-Marketplace ובפרופיל מקצועי.' },
  { title: 'בלי תוכן מיני, אלים או מסית' },
  { title: 'זהות אמיתית', text: 'בלי התחזות; פוסט אנונימי רק דרך האפשרות לפרסם באופן אנונימי.' },
  { title: 'מדווחים במקום להתווכח' },
];

/** Rule 2 (index 1) ends with the link to the medical hotlines page. */
export const HOTLINES_RULE_INDEX = 1;

export const RULES_CLOSING = 'הפרת כלל מובילה להסרת התוכן ולצעדי אכיפה';
