// The texts of images (I5; FR-FEED-002, FR-PROFILE-001, FR-FEED-008; ERR-039, ERR-040, ERR-041 as of 20.10.2026; ux-copy-he).
export const PENDING_LABEL = 'ממתין לבדיקה';
export const REJECTED_TEXT = 'התמונה לא אושרה לפי מדיניות התמונות';
export const UNAVAILABLE_TEXT = 'התמונה לא זמינה כרגע';
export const ADD_IMAGE_LABEL = 'הוספת תמונה';
export const REMOVE_IMAGE_LABEL = 'הסרת התמונה';
export const UPLOADING_TEXT = 'מעלים את התמונה';
// ERR-039: a file the picker cannot take; nothing is sent.
export const TYPE_REFUSED_TEXT = 'אפשר להעלות תמונה מסוג JPEG, ‏PNG, ‏WebP או HEIC. אפשר לבחור תמונה אחרת';
export const SIZE_REFUSED_TEXT = 'התמונה גדולה מ-15MB. אפשר לבחור תמונה קטנה יותר';
export const SHRINK_FAILED_TEXT = 'לא הצלחנו לעבד את התמונה. אפשר לבחור תמונה אחרת';
export const UPLOAD_FAILED_TEXT = 'העלאת התמונה לא הצליחה. אפשר לנסות שוב';
export const imageCountLimitText = (max: number): string => `אפשר לצרף עד ${max} תמונות`;
export const imageAlt = (index: number, total: number): string => (total === 1 ? 'תמונה בפוסט' : `תמונה ${index + 1} מתוך ${total} בפוסט`);
export const PROFILE_PHOTO_ALT = 'תמונת הפרופיל';
export const CHANGE_PHOTO_LABEL = 'החלפת התמונה';
export const SET_PHOTO_LABEL = 'הוספת תמונת פרופיל';
export const REMOVE_PHOTO_LABEL = 'הסרת תמונת הפרופיל';
export const PHOTO_PENDING_HINT = 'התמונה תוצג לאחרים אחרי בדיקה';
