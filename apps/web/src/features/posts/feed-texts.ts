// The feed screen's texts (F3.2b). Written in .work/feed-view/screen.md; gender-neutral (NFR-USAB-003). The retry label, the
// load-failure text and the empty-state action are the posts screens' own.
export const FEED_LIST_LABEL = 'פוסטים בפיד';
export const MEMBER_FALLBACK_LABEL = 'מהקהילה'; // an author whose name RLS did not return
export const ORIGINAL_UNAVAILABLE_TEXT = 'הפוסט המקורי כבר לא זמין'; // BR-065
export const EMPTY_FEED_TEXT = 'עוד אין פוסטים בפיד';
export const FEED_LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הפיד. אפשר לנסות שוב'; // ERR-004
export const TO_TOP_LABEL = 'חזרה למעלה';

export const loadedMoreText = (count: number): string =>
  count === 1 ? 'נטען פוסט אחד נוסף' : `נטענו ${count.toLocaleString('en-US')} פוסטים נוספים`;
