// The texts of notifications (FR-NOTIF-001; ux-copy-he). The sentence is built here from the type and the actor's name: the database stores
// no text. A name is placed whole into a sentence. When the name is not shown (the database did not show it, or the author is anonymous)
// the sentence says "מישהו" or "המחבר" and never guesses.
import type { NotificationItem, NotificationType } from "@nestly/shared";
import { postPath } from "@/lib/post-link";
import { userProfilePath } from "@/lib/profile-link";
import { groupPath } from "@/lib/group-link";

export const BELL_LABEL = "התראות";
export const unreadBellLabel = (count: number): string =>
  count === 0 ? BELL_LABEL : `${BELL_LABEL}, ${count} חדשות`;
export const TITLE = "התראות";
export const EMPTY_TEXT = "אין התראות חדשות. כשיהיה משהו חדש, נעדכן אותך כאן";
export const LOAD_FAILED_TEXT = "לא הצלחנו לטעון את ההתראות. אפשר לנסות שוב";
export const RETRY_LABEL = "ניסיון נוסף";
export const MARK_ALL_LABEL = "סימון הכול כנקרא";
export const MARK_FAILED_TEXT =
  "לא הצלחנו לסמן את ההתראות כנקראות. אפשר לנסות שוב";
export const VIEW_ALL_LABEL = "כל ההתראות";
export const LOAD_MORE_LABEL = "התראות קודמות";
export const LOAD_MORE_FAILED_TEXT = "לא הצלחנו לטעון עוד התראות. אפשר לנסות שוב";
export const SETTINGS_LABEL = "הגדרות התראות";
export const UNREAD_MARK = "חדשה";
export const NO_ACTOR = "מישהו";
export const AUTHOR_LABEL = "המחבר";

/** I10: a Group's name inside a sentence, or a plain "קבוצה" when it is not shown (the Group is gone). */
const inGroup = (name: string | null | undefined): string => (name === null || name === undefined ? "לקבוצה" : `לקבוצה ${name}`);

const SENTENCES: Record<NotificationType, (who: string, group: string | null | undefined) => string> = {
  friend_request: (who) => `בקשת חברות חדשה מ${who}`,
  friend_accepted: (who) => `בקשת החברות שלך אושרה על ידי ${who}`,
  post_comment: (who) => `תגובה חדשה של ${who} על הפוסט שלך`,
  comment_reply: (who) => `תשובה חדשה של ${who} לתגובה שלך`,
  post_shared: (who) => `הפוסט שלך שותף על ידי ${who}`,
  friend_post: (who) => `פוסט חדש של ${who}`,
  group_recommended: (who, group) => `המלצה מ${who} להצטרף ${inGroup(group)}`,
  group_invited: (who, group) => `הזמנה מ${who} ${inGroup(group)}`,
  group_join_requested: (who, group) => `בקשת הצטרפות חדשה מ${who} ${inGroup(group)}`,
  group_join_approved: (_who, group) => `הבקשה שלך להצטרף ${inGroup(group)} אושרה`,
  group_post: () => "פוסט חדש באחת הקבוצות שלך",
  group_pinned: () => "פוסט חדש הוצמד בקבוצה",
  group_highlight: () => "פוסט בקבוצה שלך מעורר עניין",
};

/** The sentence of one notification: the name when shown, "מישהו" when hidden, "המחבר" for the anonymous author's own comment. */
export function sentenceOf(
  item: Pick<NotificationItem, "type" | "actor" | "actorName"> & { targetName?: string | null | undefined },
): string {
  const who =
    item.actor === "author"
      ? AUTHOR_LABEL
      : item.actor === "named" && item.actorName !== null
        ? item.actorName
        : NO_ACTOR;
  return SENTENCES[item.type](who, item.targetName);
}

/** Where a notification leads. Opening it asks the server again; a post or person no longer available shows its own page's message. */
export function hrefOf(
  item: Pick<NotificationItem, "targetKind" | "targetId">,
): string {
  return item.targetKind === "post"
    ? postPath(item.targetId)
    : item.targetKind === "group"
      ? groupPath(item.targetId)
      : userProfilePath(item.targetId);
}

// FR-NOTIF-002: the settings section.
export const SETTINGS_TITLE = "התראות";
export const SETTINGS_INTRO =
  "אפשר לבחור על מה לקבל התראות באתר. התראות שכבר התקבלו נשארות.";
export const CATEGORY_LABELS = {
  friends: "בקשות חברות ואישורים",
  comments: "תגובות על פוסטים ותשובות לתגובות",
  shares: "שיתוף של פוסט שלי",
  friend_posts: "פוסטים חדשים של חברים שבחרתי",
  groups: "קבוצות: המלצות, הזמנות, בקשות ופעילות בקבוצות",
} as const;
export const FRIENDS_FOLLOW_TITLE = "פוסטים חדשים של חברים";
export const FRIENDS_FOLLOW_HINT =
  "אפשר לסמן חברים ולקבל התראה כשהם מפרסמים. פוסט אנונימי אינו מתריע.";
export const FRIENDS_FOLLOW_EMPTY = "עדיין אין חברים ברשימה";
export const followLabel = (name: string): string =>
  `התראה על פוסט חדש של ${name}`;
export const SAVE_FAILED_TEXT = "לא הצלחנו לשמור את השינוי. אפשר לנסות שוב";
export const SAVED_TEXT = "השינוי נשמר";
