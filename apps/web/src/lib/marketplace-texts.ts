import { LISTING_CATEGORY_LABELS, LISTING_CONDITION_LABELS, PROFESSIONAL_AREA_LABELS, type ListingCategory, type ListingCondition, type ProfessionalArea } from '@nestly/shared';

// The Marketplace's texts (I12; FR-MKT-001/002/003/005, FR-ADMIN-009, BR-005, BR-069, AC-008, AC-020, AC-097). Gender-neutral (NFR-USAB-003).
// The category, condition and area names are the shared lists'.
export const MARKETPLACE_TITLE = 'Marketplace';
export const MARKETPLACE_NAV_LABEL = 'חנות';
export const MARKETPLACE_INTRO = 'מוצרים לתינוקות ולהורים, למכירה או למסירה. ההתקשרות בצ׳אט בלבד: אין כאן תשלום או משלוח.';
export const MY_LISTINGS_TITLE = 'המודעות שלי';
export const NEW_LISTING_TITLE = 'מודעה חדשה';
export const EDIT_LISTING_TITLE = 'עריכת המודעה';
export const NEW_LISTING_LABEL = 'פרסום מודעה';

// ---- the list and its filters
export const SEARCH_LABEL = 'חיפוש מוצר';
export const FILTERS_LABEL = 'סינון המודעות';
export const CATEGORY_LABEL = 'קטגוריה';
export const ANY_CATEGORY = 'כל הקטגוריות';
export const CITY_LABEL = 'עיר או אזור';
export const ANY_CITY = 'כל הארץ';
export const CONDITION_LABEL = 'מצב';
export const ANY_CONDITION = 'כל מצב';
export const MAX_PRICE_LABEL = 'מחיר עד (₪)';
export const FREE_ONLY_LABEL = 'רק למסירה';
export const SORT_LABEL = 'סדר';
export const SORT_LABELS = { match: 'מתאים לי', new: 'החדשות קודם', price_low: 'מהזול ליקר' } as const;
export const APPLY_FILTERS = 'הצגה';
export const CLEAR_FILTERS = 'ניקוי';
export const RESULTS_LABEL = 'מודעות';
export const NO_RESULTS = 'אין מודעות שמתאימות לחיפוש. אפשר לשנות את הסינון.';
export const LOAD_FAILED = 'לא הצלחנו לטעון. אפשר לנסות שוב.';
export const RETRY = 'ניסיון נוסף';
export const SPONSORED_HEADING = 'מוצרים ממומנים';
/** BR-005, AC-008: the mark every Sponsored Product carries. */
export const SPONSORED_BADGE = 'ממומן';
export const sponsorText = (name: string): string => `מטעם ${name}`;
export const SPONSOR_LINK_LABEL = 'לאתר המפרסם';
export const NEW_TAB_NOTE = '(נפתח בכרטיסייה חדשה)';

// ---- one listing
export const FREE_TEXT = 'למסירה';
export const priceText = (price: number | null): string => (price === null ? FREE_TEXT : `₪${price.toLocaleString('en-US')}`);
export const categoryText = (category: ListingCategory): string => LISTING_CATEGORY_LABELS[category];
export const conditionText = (condition: ListingCondition): string => LISTING_CONDITION_LABELS[condition];
export const cityText = (city: ProfessionalArea): string => PROFESSIONAL_AREA_LABELS[city];
export const sellerText = (name: string | null): string => (name === null ? 'חשבון ללא שם' : name);
export const SOLD_BADGE = 'נמכר/נמסר';
export const HIDDEN_BADGE = 'הוסתרה על ידי הצוות';
export const EXPIRED_BADGE = 'פגה';
export const PENDING_IMAGES_NOTE = 'תמונות שממתינות לבדיקה מוצגות רק לך';
export const expiresText = (date: string): string => `מוצגת עד ${date}`;
export const SELLER_LABEL = 'פורסם על ידי';
export const NO_PURCHASE_NOTE = 'אין קנייה או תשלום דרך Nestly: מתאמים ישירות בצ׳אט.';
export const CONTACT_HEADING = 'הודעה על המודעה';
export const CONTACT_LABEL = 'ההודעה';
export const contactDraft = (title: string): string => `היי, ראיתי את המודעה "${title}". היא עדיין רלוונטית?`;
export const CONTACT_SEND = 'שליחת הודעה';
export const OPEN_CONVERSATION = 'מעבר לשיחה';
export const CONTACT_FAILED = 'ההודעה לא נשלחה. אפשר לנסות שוב.';
export const CONTACT_UNAVAILABLE = 'אי אפשר לפנות על המודעה הזו עכשיו.';
export const CONTACT_NOT_ALLOWED = 'אי אפשר לשלוח הודעה על המודעה הזו.';
export const REPORT_LISTING_LABEL = 'דיווח על המודעה';
export const REPORTED_TEXT = 'הדיווח התקבל. תודה.';
export const REPORT_FAILED_TEXT = 'הדיווח לא נשלח. אפשר לנסות שוב.';
export const LISTING_GONE = 'המודעה לא זמינה.';
export const BACK_TO_MARKETPLACE = 'חזרה ל-Marketplace';
export const BACK_TO_MINE = 'חזרה למודעות שלי';
export const imageAltOf = (title: string, index: number, count: number): string => (count === 1 ? `תמונה של ${title}` : `תמונה ${index + 1} מתוך ${count} של ${title}`);

// ---- the owner's actions
export const EDIT_LABEL = 'עריכה';
export const MARK_SOLD_LABEL = 'סימון "נמכר/נמסר"';
export const MARK_ACTIVE_LABEL = 'החזרה למכירה';
export const DELETE_LABEL = 'מחיקת המודעה';
export const DELETE_CONFIRM_TITLE = 'למחוק את המודעה?';
export const DELETE_CONFIRM_TEXT = 'המודעה והתמונות שלה יימחקו מיד, ואי אפשר לשחזר אותן.';
export const CANCEL_LABEL = 'ביטול';
export const MARKED_SOLD_TEXT = 'המודעה סומנה "נמכר/נמסר" ויצאה מה-Marketplace.';
export const MARKED_ACTIVE_TEXT = 'המודעה חזרה ל-Marketplace.';
export const DELETED_TEXT = 'המודעה נמחקה.';
export const ACTION_FAILED = 'הפעולה לא הצליחה. אפשר לנסות שוב.';
export const MINE_EMPTY = 'עוד לא פרסמת מודעות.';

// ---- the form (FR-MKT-002; no description field)
export const TITLE_LABEL = 'כותרת';
export const PRICE_LABEL = 'מחיר (₪)';
export const PRICE_HINT = 'מספר שלם, 1 עד 100,000';
export const GIVE_AWAY_LABEL = 'למסירה, בלי מחיר';
export const IMAGES_LABEL = 'תמונות (עד 6)';
export const IMAGES_HINT = 'כל תמונה נבדקת לפני שהיא מוצגת לאחרים.';
export const CHOOSE = 'בחירה';
export const SAVE_LISTING = 'פרסום';
export const SAVE_CHANGES = 'שמירת השינויים';
export const SAVING = 'שומרים';
export const SAVE_FAILED = 'המודעה לא נשמרה. אפשר לנסות שוב.';
export const NOT_REGULAR_TEXT = 'רק חשבון הורה יכול לפרסם מודעה.';
export const REMOVE_EXISTING_IMAGE = 'הסרת התמונה';
export const IMAGE_IN_REVIEW = 'אי אפשר להסיר תמונה שממתינה לבדיקת הצוות. אפשר לנסות שוב אחרי הבדיקה.';
export const FORM_ERRORS: Record<string, string> = {
  title_length: 'כותרת של 2 עד 80 תווים',
  category_required: 'צריך לבחור קטגוריה',
  condition_required: 'צריך לבחור מצב',
  price_invalid: 'מחיר במספר שלם, 1 עד 100,000, או "למסירה"',
  city_required: 'צריך לבחור עיר או אזור',
  too_many_images: 'עד 6 תמונות',
};

// ---- staff: listings (MARKETPLACE_MODERATE) and Sponsored Products (FR-ADMIN-009, Admin only)
export const ADMIN_LISTINGS_TITLE = 'מודעות Marketplace';
export const ADMIN_LISTINGS_SEARCH = 'חיפוש לפי כותרת';
export const ADMIN_LISTINGS_EMPTY = 'אין מודעות.';
export const ADMIN_REASON_LABEL = 'סיבה (נרשמת ביומן)';
export const ADMIN_REASON_REQUIRED = 'צריך לכתוב סיבה';
export const ADMIN_HIDE = 'הסתרת המודעה';
export const ADMIN_RESTORE = 'החזרת המודעה';
export const ADMIN_HIDDEN_DONE = 'המודעה הוסתרה.';
export const ADMIN_RESTORED_DONE = 'המודעה הוחזרה.';
export const ADMIN_SEARCH_BUTTON = 'חיפוש';
export const SPONSORED_TITLE = 'מוצרים ממומנים';
export const SPONSORED_INTRO = 'מוצר ממומן מוצג ב-Marketplace תמיד עם הסימון "ממומן", בנפרד ממודעות המשתמשים. קופון להצגה למרצה הוא מוצר רגיל שהתיאור שלו אומר "דוגמה".';
export const SPONSORED_NEW_HEADING = 'מוצר ממומן חדש';
export const SPONSORED_SPONSOR_LABEL = 'שם המפרסם';
export const SPONSORED_TITLE_LABEL = 'כותרת';
export const SPONSORED_DESCRIPTION_LABEL = 'תיאור';
export const SPONSORED_LINK_LABEL = 'קישור לאתר המפרסם (https)';
export const SPONSORED_IMAGE_LABEL = 'תמונה (אחת)';
export const SPONSORED_CREATE = 'שמירה כטיוטה';
export const SPONSORED_SAVE = 'שמירה';
export const SPONSORED_EDIT = 'עריכה';
export const SPONSORED_PUBLISH = 'פרסום';
export const SPONSORED_PAUSE = 'השהיה';
export const SPONSORED_REMOVE = 'הסרה';
export const SPONSORED_REMOVE_CONFIRM_TITLE = 'להסיר את המוצר הממומן?';
export const SPONSORED_REMOVE_CONFIRM_TEXT = 'מוצר שהוסר לא חוזר להצגה ואי אפשר לערוך אותו.';
export const SPONSORED_EMPTY = 'עוד אין מוצרים ממומנים.';
export const SPONSORED_SAVED = 'נשמר.';
export const SPONSORED_STATUS_LABELS = { draft: 'טיוטה', published: 'מפורסם', paused: 'מושהה', removed: 'הוסר' } as const;
export const SPONSORED_ERRORS: Record<string, string> = {
  sponsor_length: 'שם מפרסם של 2 עד 80 תווים',
  title_length: 'כותרת של 2 עד 80 תווים',
  description_too_long: 'תיאור עד 1,000 תווים',
  category_required: 'צריך לבחור קטגוריה',
  link_invalid: 'קישור שמתחיל ב-https://, עד 500 תווים',
};
