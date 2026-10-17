import type { ChoiceOption } from '@/components/shared/choice-card-group';

// The privacy settings' texts (F2.3a; Q1: written in spec.md c1 and c4, the explanations from SRS §1.4). This is the only place a
// setting or a status becomes text on this screen.

export const TITLE = 'פרטיות ואבטחה';
export const VISIBILITY_LEGEND = 'צפייה בפרופיל';
export const VISIBILITY_OPTIONS: ChoiceOption[] = [
  {
    value: 'open',
    label: 'פרופיל פתוח',
    description: 'מי שאינם חברים רואים את כל הפרופיל. על ילדים והריון מוצג רק תקציר המסע',
  },
  {
    value: 'restricted',
    label: 'פרופיל מוגבל',
    description: 'מי שאינם חברים רואים רק שם, תמונה ותקציר מסע ללא גילאים',
  },
];
export const SENTENCE_LABEL = 'הצגת המשפט כשאין ילדים והריון';
export const BIRTHDAY_LABEL = 'יום הולדת של ילד בהתראות לחברים';
export const SAVE_LABEL = 'שמירה';
export const RETRY_LABEL = 'נסו שוב';
export const LOADING_TEXT = 'טוענים את הגדרות הפרטיות';
export const LOAD_FAILED_TEXT = 'לא הצלחנו לטעון את הגדרות הפרטיות. אפשר לנסות שוב'; // c4 · ERR-004
export const SAVE_FAILED_TEXT = 'השמירה לא הצליחה. אפשר לנסות שוב'; // c4 · ERR-004
export const SAVED_TEXT = 'הפרטים נשמרו'; // c4
export const SAVING_TEXT = 'שומרים';
