// The feed screen's texts (F3.2b). Written in .work/feed-view/screen.md; gender-neutral (NFR-USAB-003). The retry label, the
// load-failure text and the empty-state action are the posts screens' own.
export const FEED_LIST_LABEL = 'פוסטים בפיד';
export const MEMBER_FALLBACK_LABEL = 'חבר/ת בקהילה'; // an author whose name RLS did not return
export const ORIGINAL_UNAVAILABLE_TEXT = 'הפוסט המקורי כבר לא זמין'; // BR-065
export const EMPTY_FEED_TEXT = 'עוד אין פוסטים בפיד';
export const TO_TOP_LABEL = 'חזרה למעלה';

export const loadedMoreText = (count: number): string => `נטענו ${count.toLocaleString('en-US')} פוסטים נוספים`;
