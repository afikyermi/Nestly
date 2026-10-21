// The texts of search (FR-SEARCH-001; ux-copy-he). A name is only ever placed whole into a sentence.
export const TITLE = "תוצאות חיפוש";
export const SEARCH_LABEL = "חיפוש";
export const SEARCH_PLACEHOLDER_LABEL = "חיפוש אנשים ופוסטים";
export const SUBMIT_LABEL = "חיפוש";
export const VIEW_ALL_LABEL = "הצגת כל התוצאות";
export const TABS = {
  all: "הכול",
  people: "אנשים",
  groups: "קבוצות",
  posts: "פוסטים",
} as const;
export const PEOPLE_TITLE = "אנשים";
export const GROUPS_TITLE = "קבוצות";
export const POSTS_TITLE = "פוסטים";
export const PROMPT_TEXT = "אפשר לחפש משתי אותיות";
export const LOADING_TEXT = "מחפשים";
export const NONE_TEXT = "לא מצאנו תוצאות. אפשר לנסות מילים אחרות";
export const PEOPLE_NONE_TEXT = "לא נמצאו אנשים בשם הזה";
export const GROUPS_NONE_TEXT = "לא נמצאו קבוצות";
export const POSTS_NONE_TEXT = "לא נמצאו פוסטים";
export const LIMITED_TEXT =
  "הגעתם למספר החיפושים לשעה. אפשר להמשיך לחפש פוסטים, ולחפש אנשים בעוד זמן מה";
export const FAILED_TEXT = "לא הצלחנו לחפש. אפשר לנסות שוב";
export const RETRY_LABEL = "ניסיון נוסף";
export const ANONYMOUS_AUTHOR = 'פוסט אנונימי';
export const personLink = (name: string): string => `לפרופיל של ${name}`;

/** I10: under a Group's name in the results. */
export const GROUP_PRIVACY_LABEL = { public: "קבוצה ציבורית", private: "קבוצה פרטית" } as const;
