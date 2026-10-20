// The texts of Stories (FR-FEED-008, VAL-042, ERR-040; ux-copy-he).
export const TRAY_LABEL = 'סטורי';
export const ADD_STORY_LABEL = 'הוספת סטורי';
export const NEW_STORY_TITLE = 'סטורי חדש';
export const CAPTION_LABEL = 'טקסט (לא חובה)';
export const AUDIENCE_LEGEND = 'מי יראה את הסטורי';
export const AUDIENCE_LABELS = { everyone: 'כולם', friends: 'חברים בלבד' } as const;
export const PICK_IMAGE_LABEL = 'בחירת תמונה';
export const PUBLISH_LABEL = 'פרסום';
export const PUBLISHING_TEXT = 'מפרסמים';
export const CANCEL_LABEL = 'ביטול';
export const CLOSE_LABEL = 'סגירה';
export const NEXT_LABEL = 'הסטורי הבא';
export const PREVIOUS_LABEL = 'הסטורי הקודם';
export const IMAGE_REQUIRED_TEXT = 'יש לבחור תמונה לסטורי';
export const CAPTION_TOO_LONG_TEXT = 'הטקסט ארוך מדי. אפשר עד 200 תווים';
// ERR-040: the eleventh in 24 hours.
export const LIMIT_TEXT = 'אפשר לפרסם עד 10 סטורי ב-24 שעות. אפשר לפרסם שוב מאוחר יותר';
export const PUBLISH_FAILED_TEXT = 'הפרסום לא הצליח. אפשר לנסות שוב';
export const EXPIRES_HINT = 'הסטורי יימחק אחרי 24 שעות';
export const PENDING_HINT = 'הסטורי יוצג לאחרים אחרי בדיקת התמונה';
export const MY_STORY_LABEL = 'הסטורי שלי';
export const storyOf = (name: string): string => `הסטורי של ${name}`;
export const MEMBER_FALLBACK = 'חבר בקהילה';
export const storyPosition = (index: number, total: number): string => `${index + 1} מתוך ${total}`;
export const charactersLeft = (left: number): string => `נותרו ${left} תווים`;
