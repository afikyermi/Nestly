import {
  PROFESSIONAL_AREA_LABELS,
  type ProfileOptionalField,
  PROFESSIONAL_FIELD_LABELS,
  type ProfessionalArea,
  type ProfessionalField,
} from '@nestly/shared';

// The Hebrew texts of Professionals and services (I11). Plural or neutral forms only (NFR-USAB-003: no slash forms).

export const DIRECTORY_TITLE = 'בעלי מקצוע';
export const DIRECTORY_NAV_LABEL = 'יועצים';
export const DIRECTORY_INTRO = 'יועצים ואנשי מקצוע להריון, ללידה ולהורות. אפשר לסנן לפי תחום, אזור, דירוג, מחיר וניסיון.';
export const FILTERS_LABEL = 'סינון';
export const FIELD_LABEL = 'תחום';
export const ANY_FIELD = 'כל התחומים';
export const AREA_LABEL = 'אזור';
export const ANY_AREA = 'כל האזורים';
export const MIN_RATING_LABEL = 'דירוג מינימלי';
export const ANY_RATING = 'כל דירוג';
export const MAX_PRICE_LABEL = 'מחיר עד (₪)';
export const MIN_YEARS_LABEL = 'ניסיון של לפחות (שנים)';
export const SORT_LABEL = 'מיון';
export const SORT_LABELS = { match: 'הכי מתאימים', rating: 'דירוג', price: 'מחיר', experience: 'ניסיון' } as const;
export const APPLY_FILTERS = 'הצגת תוצאות';
export const CLEAR_FILTERS = 'ניקוי הסינון';
export const RESULTS_LABEL = 'תוצאות';
export const NO_RESULTS = 'לא נמצאו בעלי מקצוע לפי הסינון הזה.';
export const LOAD_FAILED = 'לא הצלחנו לטעון. אפשר לנסות שוב.';
export const RETRY = 'ניסיון נוסף';
export const ACTION_FAILED = 'הפעולה לא הצליחה. אפשר לנסות שוב.';

export const fieldText = (field: ProfessionalField, other: string | null): string =>
  field === 'other' && other !== null ? other : PROFESSIONAL_FIELD_LABELS[field];
export const areaText = (area: ProfessionalArea | null): string | null => (area === null ? null : PROFESSIONAL_AREA_LABELS[area]);
export const yearsText = (years: number): string => (years === 0 ? 'בתחילת הדרך' : years === 1 ? 'שנת ניסיון אחת' : `${years} שנות ניסיון`);
export const priceText = (price: number | null): string | null => (price === null ? null : `החל מ-${price.toLocaleString('he-IL')} ₪`);
export const ratingText = (rating: number | null, count: number): string =>
  rating === null ? 'עוד אין ביקורות' : `דירוג ${rating.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} מתוך 5 · ${count === 1 ? 'ביקורת אחת' : `${count} ביקורות`}`;

// ---- the profile page
export const FOLLOW = 'מעקב';
export const UNFOLLOW = 'הפסקת מעקב';
export const FOLLOWING_NOTE = 'במעקב';
export const WRITE_MESSAGE = 'שליחת הודעה';
export const OPEN_CONVERSATION = 'מעבר לשיחה';
export const MESSAGE_LABEL = 'הודעה';
export const MESSAGE_REQUIRED = 'יש לכתוב הודעה';
export const MESSAGE_TOO_LONG = 'ההודעה ארוכה מדי. אפשר עד 2,000 תווים';
export const SEND = 'שליחה';
export const CANCEL = 'ביטול';
export const MESSAGE_FREE_NOTE = 'הפנייה לבעלי מקצוע בחינם, בלי אישור מראש.';
export const ABOUT_HEADING = 'על השירות';
export const REVIEWS_HEADING = 'ביקורות';
export const NO_REVIEWS = 'עוד אין ביקורות.';
export const WRITE_REVIEW = 'כתיבת ביקורת';
export const REVIEW_RATING_LABEL = 'דירוג';
export const REVIEW_TEXT_LABEL = 'הביקורת';
export const REVIEW_SEND = 'פרסום הביקורת';
export const REVIEW_SAVED = 'הביקורת פורסמה. תודה!';
export const REVIEW_ALREADY = 'כבר נכתבה ביקורת על הפנייה הזו.';
export const REVIEW_TEXT_REQUIRED = 'יש לכתוב כמה מילים';
export const REVIEW_RATING_REQUIRED = 'יש לבחור דירוג';
export const REVIEW_NOTE = 'ביקורת אחת לכל פנייה. האחריות לתוכן הביקורת היא של מי שכתב אותה.';
export const reviewStars = (rating: number): string => `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
export const reviewStarsLabel = (rating: number): string => `${rating} מתוך 5`;
export const ARTICLES_HEADING = 'מאמרים';
export const NO_ARTICLES = 'עוד אין מאמרים.';
export const ARTICLE_DISCLAIMER = 'המאמר נכתב על ידי בעל המקצוע, והאחריות לתוכנו היא שלו. המידע אינו אבחון ואינו תחליף לייעוץ אישי.';
export const PROFILE_GONE = 'הפרופיל הזה לא זמין.';

// ---- registration and the profile form
export const PRO_REGISTER_LINK = 'נרשמים כבעלי מקצוע? להרשמה לחשבון מקצועי';
export const PERSONAL_REGISTER_LINK = 'להרשמה לחשבון אישי';
export const PRO_STEP_TITLE = 'פרטים מקצועיים';
export const PRO_STEP_INTRO = 'חשבון מקצועי נפרד מחשבון אישי. אין צורך במספר עוסק או באימות.';
// Afik 21.10.2026: the required declaration, in the gender-neutral form of NFR-USAB-003
export const QUALIFICATION_DECLARATION = 'הצהרה: יש לי ההכשרה והרישיון הנדרשים בתחום שבחרתי';
export const QUALIFICATION_REQUIRED = 'יש לאשר את ההצהרה כדי להמשיך';
export const FULL_NAME_LABEL = 'שם מלא';
export const BUSINESS_NAME_LABEL = 'שם העסק';
export const GENDER_LABEL = 'מין';
export const GENDER_PLACEHOLDER = 'בחירה';
export const GENDER_LABELS = { woman: 'אישה', man: 'גבר', other: 'אחר', prefer_not_to_say: 'מעדיפים לא לומר' } as const;
export const FIELD_PLACEHOLDER = 'בחירת תחום';
export const FIELD_OTHER_LABEL = 'מה התחום?';
export const YEARS_LABEL = 'שנות ניסיון';
export const AREA_PLACEHOLDER = 'בחירת אזור';
export const ABOUT_LABEL = 'על השירות שלך';
export const PRICE_LABEL = 'מחיר החל מ (₪)';
export const CONTINUE = 'המשך';
export const SAVE = 'שמירה';
export const SAVED = 'נשמר.';
export const PROFILE_EDIT_TITLE = 'הפרופיל המקצועי שלי';
export const VIEW_MY_PAGE = 'צפייה בעמוד שלי';
export const FORM_ERRORS: Readonly<Record<string, string>> = {
  full_name_length: 'שם מלא באורך 2 עד 60 תווים',
  business_name_length: 'שם העסק באורך 2 עד 80 תווים',
  field_required: 'יש לבחור תחום',
  field_other_length: 'יש לכתוב את התחום, 2 עד 40 תווים',
  years_invalid: 'מספר שנים בין 0 ל-60',
  about_too_long: 'אפשר עד 1,000 תווים',
  price_invalid: 'מחיר בשקלים, מספר שלם עד 100,000',
};

// ---- the Professional's home
export const PRO_HOME_TITLE = 'לוח הבקרה';
export const KPI_HEADING = 'הנתונים שלך';
export const KPI_FOLLOWERS = 'עוקבים';
export const KPI_CHATS = 'שיחות חדשות (30 יום)';
export const KPI_RATING = 'דירוג';
export const KPI_ENGAGEMENT = 'לייקים ותגובות (30 יום)';
export const KPI_POSTS = 'פוסטים (30 יום)';
export const KPI_ARTICLES = 'מאמרים';
export const KPI_NOTE = 'הנתונים מצטברים בלבד ואינם מראים מי עשה מה.';
export const offersLeftText = (used: number, limit: number): string => `הצעות עזרה היום: ${used} מתוך ${limit}`;
export const HELP_HEADING = 'פוסטים שמבקשים עזרה';
export const HELP_INTRO = 'אפשר להציע עזרה פעם אחת לכל פוסט, ועד 10 הצעות ביום. אין לשלוח הודעות פרסום.';
export const NO_HELP = 'כרגע אין פוסטים שמבקשים עזרה.';
export const ANONYMOUS_AUTHOR = 'פוסט אנונימי';
export const OFFER_HELP = 'הצעת עזרה';
export const OFFERED = 'נשלחה הצעה';
export const OPEN_POST = 'לפוסט';
export const OFFER_TEXT_LABEL = 'ההודעה הראשונה';
export const OFFER_SEND = 'שליחת ההצעה';
export const OFFER_SENT = 'ההצעה נשלחה. אם תאושר, תיפתח שיחה.';
export const OFFER_LIMIT = 'הגעת ל-10 הצעות עזרה היום. אפשר לנסות שוב מחר.';
export const OFFER_ALREADY = 'כבר נשלחה הצעה לפוסט הזה.';
export const OFFER_NOT_ALLOWED = 'אי אפשר להציע עזרה לפוסט הזה.';
export const OFFER_TEXT_REQUIRED = 'יש לכתוב הודעה';
export const EDIT_PROFILE = 'עריכת הפרופיל המקצועי';
export const MY_ARTICLES = 'המאמרים שלי';

// ---- articles
export const ARTICLES_TITLE = 'המאמרים שלי';
export const NEW_ARTICLE = 'מאמר חדש';
export const ARTICLE_TITLE_LABEL = 'כותרת';
export const ARTICLE_BODY_LABEL = 'המאמר';
export const ARTICLE_FIELD_LABEL = 'תחום';
export const ARTICLE_HIDDEN_LABEL = 'מוסתר (רק אני רואה)';
export const ARTICLE_PUBLISH = 'פרסום';
export const ARTICLE_SAVE = 'שמירת השינויים';
export const ARTICLE_EDIT = 'עריכה';
export const ARTICLE_DELETE = 'מחיקה';
export const ARTICLE_DELETE_CONFIRM = 'למחוק את המאמר?';
export const ARTICLE_HIDDEN_BADGE = 'מוסתר';
export const ARTICLE_ERRORS = { title: 'כותרת באורך 2 עד 120 תווים', body: 'יש לכתוב את המאמר, עד 10,000 תווים' } as const;

// ---- Offer Help, the author's side
export const OFFERS_TITLE = 'הצעות עזרה';
export const OFFERS_INTRO = 'בעלי מקצוע שהציעו עזרה בעקבות פוסט שביקש עזרה. רק אישור פותח שיחה; אפשר גם לדחות או להתעלם.';
export const OFFERS_RECEIVED = 'הצעות שקיבלת';
export const OFFERS_SENT = 'הצעות ששלחת';
export const NO_OFFERS = 'אין הצעות עזרה.';
export const ACCEPT = 'אישור ופתיחת שיחה';
export const DECLINE = 'דחייה';
export const STATUS_LABELS = { pending: 'ממתינה', accepted: 'אושרה', declined: 'נדחתה' } as const;
export const ON_POST = 'על הפוסט:';

// ---- the feed
export const HELP_REQUEST_CHECKBOX = 'הפוסט מבקש עזרה מבעלי מקצוע';
export const HELP_REQUEST_HINT = 'בעלי מקצוע יוכלו להציע עזרה. הצעה פותחת שיחה רק אם מאשרים אותה.';
export const HELP_REQUEST_BADGE = 'מבקשים עזרה';

// ---- reporting a review or an article (I11 follow-ups, FR-MOD-001)
export const REPORT_REVIEW = 'דיווח על הביקורת';
export const REPORT_ARTICLE = 'דיווח על המאמר';

// ---- the Professional's home, in Afik's order (21.10.2026, decisions-in-force.md §9.8)
export const WAITING_HEADING = 'מחכה לך';
export const NOTHING_WAITING = 'אין כרגע דברים שמחכים לך.';
export const unreadChatsText = (n: number): string => (n === 1 ? 'שיחה אחת עם הודעה שלא נקראה' : `${n} שיחות עם הודעות שלא נקראו`);
export const acceptedOffersText = (n: number): string => (n === 1 ? 'הצעת עזרה אחת אושרה' : `${n} הצעות עזרה אושרו`);
export const newReviewsText = (n: number): string => (n === 1 ? 'ביקורת חדשה אחת' : `${n} ביקורות חדשות`);
export const ALL_HELP_REQUESTS = 'לכל הפוסטים שמבקשים עזרה';
export const KPI_ACCEPTANCE = 'הצעות עזרה שאושרו';
/** The Offer Help acceptance rate: accepted out of answered (pending ones are not counted). */
export const acceptanceText = (accepted: number, answered: number): string => (answered === 0 ? '—' : `${Math.round((accepted / answered) * 100)}% (${accepted}/${answered})`);
export const COMPLETENESS_HEADING = 'השלמת הפרופיל';
export const completenessLabel = (percent: number): string => `הפרופיל מלא ב-${percent}%`;
export const COMPLETENESS_DONE = 'כל פרטי הפרופיל מלאים.';
export const COMPLETENESS_MISSING = 'חסר:';
export const PROFILE_FIELD_NAMES: Readonly<Record<ProfileOptionalField, string>> = {
  businessName: 'שם העסק',
  gender: 'מין',
  area: 'אזור',
  about: 'על השירות',
  priceFrom: 'מחיר',
};
export const CONTENT_HEADING = 'תוצאות התוכן';
export const PROMOTION_HEADING = 'קידום';
export const PROMOTION_NOT_YET = 'קידום בתשלום עדיין לא זמין. כשייפתח, אפשר יהיה לקדם את הפרופיל והתוכן ולראות כאן את התוצאות.';

// ---- the Professional's menu and navigation (Afik 21.10.2026, §9.8)
export const HELP_REQUESTS_TITLE = 'בקשות עזרה';
export const FOLLOWING_TITLE = 'בעלי מקצוע במעקב';
export const FOLLOWING_LIST_LABEL = 'בעלי מקצוע במעקב';
export const FOLLOWING_EMPTY = 'עדיין אין בעלי מקצוע במעקב. אפשר למצוא בעלי מקצוע ולעקוב אחריהם במדריך.';
/** The rest of the unfollow button's accessible name: "הפסקת מעקב אחרי <name>". */
export const unfollowSuffix = (name: string): string => ` אחרי ${name}`;
export const unfollowedText = (name: string): string => `המעקב אחרי ${name} הופסק.`;
export const MY_OFFERS = 'ההצעות שלי';
export const PROMOTION_TITLE = 'קידום ותוצאות';
export const BILLING_TITLE = 'חיוב ותשלומים';
export const BILLING_NOT_YET = 'אין כרגע חיובים. תשלום יידרש רק לקידום בתשלום, שעדיין לא זמין.';
export const NOT_YET_NOTE = 'העמוד הזה ייפתח בהמשך.';
export const NOT_A_PROFESSIONAL = 'הרשימה הזו מיועדת לבעלי מקצוע.';
