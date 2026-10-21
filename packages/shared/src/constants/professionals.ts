// Value lists and limits of Professionals and services (I11; migration 20261022400000). Held once here; the CHECK constraints
// professional_profiles_field_check, professional_articles_field_check, professional_profiles_area_check and the length checks state the same.

/** FR-PROREG-001: the fields a Professional chooses from (the SRS list is TBD; a default list, I11). `other` takes a short text. */
export const PROFESSIONAL_FIELDS = [
  'doula',
  'midwife',
  'lactation',
  'sleep',
  'nutrition',
  'pediatric_physio',
  'pelvic_physio',
  'psychology',
  'parenting',
  'child_development',
  'speech',
  'occupational',
  'fertility',
  'photography',
  'other',
] as const;
export type ProfessionalField = (typeof PROFESSIONAL_FIELDS)[number];

/** The Hebrew name of each field, as the forms, the directory and the "יועץ · תחום" tag show it. */
export const PROFESSIONAL_FIELD_LABELS: Readonly<Record<ProfessionalField, string>> = {
  doula: 'דולה',
  midwife: 'מיילדת',
  lactation: 'ייעוץ הנקה',
  sleep: 'ייעוץ שינה',
  nutrition: 'תזונה',
  pediatric_physio: 'פיזיותרפיה לילדים',
  pelvic_physio: 'פיזיותרפיה לרצפת האגן',
  psychology: 'פסיכולוגיה וטיפול רגשי',
  parenting: 'הדרכת הורים',
  child_development: 'התפתחות הילד',
  speech: 'קלינאות תקשורת',
  occupational: 'ריפוי בעיסוק',
  fertility: 'פוריות',
  photography: 'צילום',
  other: 'אחר',
};

/** §12, FR-SERV-002: a city or area from a list, no GPS and no map (Afik 18.10.2026; the list itself is a default, I11). */
export const PROFESSIONAL_AREAS = [
  'jerusalem',
  'tel_aviv',
  'center',
  'sharon',
  'shfela',
  'haifa',
  'north',
  'south',
  'beer_sheva',
  'eilat',
  'judea_samaria',
] as const;
export type ProfessionalArea = (typeof PROFESSIONAL_AREAS)[number];

export const PROFESSIONAL_AREA_LABELS: Readonly<Record<ProfessionalArea, string>> = {
  jerusalem: 'ירושלים והסביבה',
  tel_aviv: 'תל אביב-יפו',
  center: 'המרכז',
  sharon: 'השרון',
  shfela: 'השפלה',
  haifa: 'חיפה והקריות',
  north: 'הצפון',
  south: 'הדרום',
  beer_sheva: 'באר שבע והנגב',
  eilat: 'אילת והערבה',
  judea_samaria: 'יהודה ושומרון',
};

export const BUSINESS_NAME_MIN = 2;
export const BUSINESS_NAME_MAX = 80;
export const FIELD_OTHER_MIN = 2;
export const FIELD_OTHER_MAX = 40;
export const YEARS_EXPERIENCE_MAX = 60;
export const PROFESSIONAL_ABOUT_MAX = 1000;
export const PRICE_FROM_MAX = 100000;

/** FR-SERV-008, BR-009: Offer Help requests per Professional in 24 hours (outreach_requests_insert_limit, NS029). */
export const OUTREACH_PER_DAY = 10;

/** FR-SERV-011: a review's text, in code points (professional_reviews_body_check). */
export const REVIEW_TEXT_MAX = 1000;

/** FR-PRO-003: an article's title and text (professional_articles_title_check, professional_articles_body_check). */
export const ARTICLE_TITLE_MIN = 2;
export const ARTICLE_TITLE_MAX = 120;
export const ARTICLE_BODY_MAX = 10000;
export const ARTICLE_STATUSES = ['published', 'hidden'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Offer Help status (VAL-011). "Ignore" leaves a request pending. */
export const OUTREACH_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/** FR-SERV-002: the directory's sort orders. `match` is the organic ranking (FR-ALG-005). */
export const DIRECTORY_SORTS = ['match', 'rating', 'price', 'experience'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

/** The "יועץ · תחום" tag on a Professional's post, comment and card (decisions-in-force §4, I11). */
export function professionalTag(field: ProfessionalField, fieldOther: string | null): string {
  return `יועץ · ${field === 'other' && fieldOther !== null ? fieldOther : PROFESSIONAL_FIELD_LABELS[field]}`;
}
