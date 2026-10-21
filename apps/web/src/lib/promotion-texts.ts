import type { PromotionPlanKey, PromotionState, PromotionTargetKind } from '@nestly/shared';

// Promotions (I13; FR-SERV-010, FR-MKT-004, FR-PRO-002, FR-ALG-007, NFR-SEC-007; Afik 21.10.2026 §11.1–11.6). Gender-neutral Hebrew
// (NFR-USAB-003): impersonal phrasing, no slash forms.

// ---- labels on the surfaces (§11.5, BR-005, VAL-012) ----------------------------------------------------------------------------------------
/** A Professional's promoted profile or post, and a brand's Sponsored Product. */
export const SPONSORED_LABEL = 'ממומן';
/** A Regular's promoted Marketplace listing. */
export const PROMOTED_LISTING_LABEL = 'מודעה מקודמת';
export const PROMOTED_LISTINGS_HEADING = 'מודעות מקודמות';
export const PROMOTED_PROFESSIONALS_HEADING = 'בעלי מקצוע ממומנים';

// ---- the promotion screen (PG-041) -------------------------------------------------------------------------------------------------------
export const PROMOTION_SCREEN_TITLE = 'קידום ותוצאות';
export const PROMOTION_INTRO = 'קידום בתשלום מגדיל את החשיפה בלבד. הוא לא משנה דירוג, ביקורות או את הסדר האורגני, ותמיד מסומן כממומן.';
export const SIMULATED_NOTE = 'התשלום מדומה: לא נגבה כסף ולא נדרשים פרטי כרטיס.';
export const SAMPLE_PRICE = 'מחיר לדוגמה';
export const BUY_HEADING = 'קידום חדש';
export const TARGET_LABEL = 'מה לקדם';
export const PLAN_LABEL = 'משך הקידום';
export const TARGET_PROFILE = 'הפרופיל המקצועי שלי';
export const POST_PREFIX = 'פוסט: ';
export const NO_POSTS_TO_PROMOTE = 'אין כרגע פוסט שאפשר לקדם. אפשר לקדם פוסט פעיל שפורסם לכולם, לא בקבוצה ולא שיתוף.';
export const BUY = 'לתשלום ולהפעלת הקידום';
export const BUYING = 'מפעילים את הקידום…';
export const CONFIRM_TITLE = 'אישור תשלום מדומה';
export const CONFIRM_BUY = 'אישור התשלום';
export const CANCEL = 'ביטול';
export const BOUGHT = 'הקידום פעיל. התשלום המדומה נרשם במסך החיובים.';
export const ALREADY_PROMOTED = 'כבר יש קידום פעיל על הפריט הזה.';
export const NOT_ALLOWED = 'אי אפשר לקדם את הפריט הזה כרגע.';
export const BUY_FAILED = 'לא הצלחנו להפעיל את הקידום. אפשר לנסות שוב.';
export const MY_PROMOTIONS = 'הקידומים שלי';
export const NO_PROMOTIONS = 'עוד אין קידומים.';
export const STOP = 'עצירת הקידום';
export const STOP_FAILED = 'לא הצלחנו לעצור את הקידום. אפשר לנסות שוב.';
export const STOPPED_BY_STAFF = 'הקידום הופסק';
export const STOPPED_BY_STAFF_NOTE = 'צוות האתר עצר את הקידום. אין החזר על קידום שהופסק.';
export const LOAD_FAILED = 'לא הצלחנו לטעון. אפשר לנסות שוב.';
export const RETRY = 'לנסות שוב';
export const RESULTS_HEADING = 'תוצאות ב-30 הימים האחרונים';
export const ORGANIC_HEADING = 'אורגני';
export const PAID_HEADING = 'מקידום בתשלום';
export const BILLING_LINK = 'לחיובים ולתשלומים';
export const LOADING = 'טוענים…';

export const STATE_LABELS: Readonly<Record<PromotionState, string>> = { running: 'פעיל', stopped: 'נעצר', ended: 'הסתיים' };
export const TARGET_KIND_LABELS: Readonly<Record<PromotionTargetKind, string>> = { profile: 'פרופיל מקצועי', post: 'פוסט', listing: 'מודעה' };
export const PLAN_LABELS: Readonly<Record<PromotionPlanKey, string>> = {
  profile_7: 'שבוע',
  profile_30: '30 ימים',
  post_3: '3 ימים',
  post_7: 'שבוע',
  listing_3: '3 ימים',
  listing_7: 'שבוע',
};

export const ORGANIC_LABELS = {
  profileViews: 'צפיות בפרופיל',
  profileViewers: 'צופים בפרופיל',
  postViews: 'צפיות בפוסטים',
  postReach: 'חשיפה של הפוסטים',
  followers: 'עוקבים',
  engagement: 'תגובות ולייקים',
  chatStarts: 'שיחות שנפתחו',
} as const;
export const PAID_LABELS = {
  impressions: 'חשיפות',
  clicks: 'לחיצות',
  profileVisits: 'כניסות לפרופיל',
  follows: 'עוקבים מקידום',
  chatStarts: 'שיחות מקידום',
  sampleSpentIls: 'סכום לדוגמה ששולם',
  costPerClickIls: 'עלות ללחיצה (לדוגמה)',
} as const;

export const shekels = (amount: number): string => `₪${amount.toLocaleString('he-IL')}`;
export const planText = (plan: PromotionPlanKey, price: number): string => `${PLAN_LABELS[plan]} · ${shekels(price)} (${SAMPLE_PRICE})`;
export const countsText = (impressions: number, clicks: number): string => `${impressions} חשיפות · ${clicks} לחיצות`;

// ---- billing (PG-042) --------------------------------------------------------------------------------------------------------------------
export const BILLING_SCREEN_TITLE = 'חיוב ותשלומים';
export const BILLING_INTRO = 'כאן מופיעים התשלומים על קידום. כל התשלומים מדומים, והסכומים הם לדוגמה.';
export const NO_PAYMENTS = 'עוד אין תשלומים.';
export const SIMULATED_BADGE = 'מדומה';
export const REFERENCE_LABEL = 'אסמכתה';

// ---- promote a listing (FR-MKT-004) ------------------------------------------------------------------------------------------------------
export const PROMOTE_LISTING = 'קידום המודעה';
export const PROMOTE_LISTING_TITLE = 'קידום המודעה';
export const PROMOTE_LISTING_INTRO = 'מודעה מקודמת מופיעה בראש תוצאות ה-Marketplace למי שמחפש ומסנן לפיה, עם הסימון "מודעה מקודמת".';
export const LISTING_PROMOTED = 'המודעה מקודמת';

// ---- staff (§11.1, §11.2) ----------------------------------------------------------------------------------------------------------------
export const ADMIN_PROMOTIONS_TITLE = 'קידומים';
export const ADMIN_PROMOTIONS_INTRO = 'קידומים פעילים וקודמים. אפשר לעצור קידום פעיל עם סיבה; העצירה נרשמת ביומן הפעולות ואין החזר.';
export const ADMIN_TOTALS = 'סיכום';
export const ADMIN_STOP = 'עצירה';
export const ADMIN_STOP_TITLE = 'עצירת קידום';
export const ADMIN_STOP_REASON = 'סיבת העצירה';
export const ADMIN_STOP_CONFIRM = 'לעצור את הקידום';
export const ADMIN_STOPPED = 'הקידום נעצר.';
export const ADMIN_STOP_FAILED = 'לא הצלחנו לעצור את הקידום. אפשר לנסות שוב.';
export const REASON_REQUIRED = 'יש לכתוב סיבה';
export const REASON_TOO_LONG = 'הסיבה יכולה להכיל עד 500 תווים';
export const NO_ADMIN_PROMOTIONS = 'אין קידומים להצגה.';
export const FORBIDDEN = 'אין הרשאה לעמוד הזה.';
export const OWNER_LABEL = 'בעלים';
export const STOPPED_BY_STAFF_SHORT = 'נעצר על ידי הצוות';
export const totalsText = (t: { running: number; stopped: number; ended: number }): string => `${t.running} פעילים · ${t.stopped} נעצרו · ${t.ended} הסתיימו`;
export const revenueText = (payments: number, revenue: number): string => `${payments} תשלומים מדומים · ${shekels(revenue)} (${SAMPLE_PRICE})`;

export const SETTINGS_HEADING = 'הגדרות הקידום';
export const SETTINGS_INTRO =
  'פוסט ממומן מופיע בפיד אחרי מספר פוסטים אורגניים: מעט פוסטים ב-48 השעות האחרונות — המרווח הקטן, הרבה פוסטים — המרווח הגדול, ובין לבין באופן הדרגתי.';
export const SETTINGS_LABELS = {
  dailyCap: 'חשיפות של קידום אחד לאותו משתמש ביום',
  directoryUnitsPerPage: 'בעלי מקצוע ממומנים בעמוד של אינדקס בעלי המקצוע',
  feedGapMin: 'פוסטים אורגניים בין פוסטים ממומנים — כשיש מעט פוסטים',
  feedGapMax: 'פוסטים אורגניים בין פוסטים ממומנים — כשיש הרבה פוסטים',
  feedLowPosts: 'סף "מעט פוסטים" (ב-48 שעות)',
  feedHighPosts: 'סף "הרבה פוסטים" (ב-48 שעות)',
  reason: 'סיבת השינוי',
} as const;
export const SAVE_SETTINGS = 'שמירת גרסה חדשה';
export const SETTINGS_SAVED = 'הגרסה החדשה נשמרה ונרשמה ביומן הפעולות.';
export const SETTINGS_FAILED = 'לא הצלחנו לשמור. יש לבדוק את הערכים ולנסות שוב.';
export const SETTINGS_INVALID = 'הערכים לא תקינים: המרווח הגדול לא קטן מהקטן, והסף של "הרבה" גבוה מהסף של "מעט".';
export const versionText = (version: number): string => `גרסה ${version}`;
