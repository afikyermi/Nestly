// The texts of notifications (FR-NOTIF-001; ux-copy-he). The sentence is built here from the type and the actor's name: the database stores
// no text. A name is placed whole into a sentence. When the name is not shown (the database did not show it, or the author is anonymous)
// the sentence says "מישהו" or "המחבר" and never guesses.
import type { NotificationItem, NotificationType } from "@nestly/shared";
import { postPath } from "@/lib/post-link";
import { userProfilePath } from "@/lib/profile-link";
import { groupPath } from "@/lib/group-link";
import { OFFERS_PATH, professionalPagePath } from "@/lib/professional-link";

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

/** I11 follow-ups: the weekly digest's sentence, by its number of new followers. */
const followersText = (count: number | undefined): string =>
  count === undefined || count === 0
    ? "סיכום העוקבים השבועי"
    : count === 1
      ? "עוקב חדש אחד בשבוע שעבר"
      : `${count} עוקבים חדשים בשבוע שעבר`;

const SENTENCES: Record<NotificationType, (who: string, group: string | null | undefined, count: number | undefined) => string> = {
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
  // I10 completion C (§11.15, §11.16): the manager who acted is never named on the mute notice
  group_invitation_pending: (who, group) => `הזמנה של ${who} ${inGroup(group)} מחכה לאישור שלך`,
  group_invitation_approved: (_who, group) => `ההזמנה ששלחת ${inGroup(group)} אושרה ונשלחה`,
  group_invitation_rejected: (_who, group) => `ההזמנה ששלחת ${inGroup(group)} לא אושרה`,
  group_member_muted: (_who, group) => `קיבלת אזהרה ${group === null || group === undefined ? 'בקבוצה' : `בקבוצה ${group}`}. בינתיים אפשר רק לקרוא`,
  // I11 follow-ups (OP-051 cancelled): the Professional's events; who answered, reviewed or followed is never named
  offer_accepted: () => "הצעת עזרה שלך אושרה. אפשר להמשיך בשיחה",
  offer_declined: () => "הצעת עזרה שלך נדחתה",
  review_received: () => "התקבלה ביקורת חדשה על הפרופיל המקצועי שלך",
  followers_weekly: (_who, _group, count) => followersText(count),
  // BR-037, AC-046 (Afik 21.10.2026, OP-060 closed): the child is named only to a Friend who sees the name on the parent's profile, and the
  // profile shows it to no one (FR-PRIV-001), so every Friend gets this sentence; never an age or a birth date. Afik's slash form is written
  // out in full (NFR-USAB-003: no slash gender forms)
  child_birthday: (who) => `יום הולדת לילד או לילדה של ${who}`,
};

/** The sentence of one notification: the name when shown, "מישהו" when hidden, "המחבר" for the anonymous author's own comment. */
export function sentenceOf(
  item: Pick<NotificationItem, "type" | "actor" | "actorName"> & { targetName?: string | null | undefined; count?: number | undefined },
): string {
  const who =
    item.actor === "author"
      ? AUTHOR_LABEL
      : item.actor === "named" && item.actorName !== null
        ? item.actorName
        : NO_ACTOR;
  return SENTENCES[item.type](who, item.targetName, item.count);
}

/** Where a notification leads. Opening it asks the server again; a post or person no longer available shows its own page's message. */
export function hrefOf(
  item: Pick<NotificationItem, "targetKind" | "targetId"> & { type?: NotificationItem["type"] },
): string {
  // the weekly follower digest leads to the Professional's home, where the followers are counted
  if (item.type === "followers_weekly") return "/home";
  switch (item.targetKind) {
    case "post":
      return postPath(item.targetId);
    case "group":
      return groupPath(item.targetId);
    case "outreach":
      return OFFERS_PATH;
    case "professional":
      return professionalPagePath(item.targetId);
    default:
      return userProfilePath(item.targetId);
  }
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
  offers: "הצעות עזרה שאושרו או נדחו",
  reviews: "ביקורות חדשות על הפרופיל המקצועי",
  followers: "סיכום שבועי של עוקבים חדשים",
  birthdays: "ימי הולדת של ילדים של חברים",
} as const;
export const FRIENDS_FOLLOW_TITLE = "פוסטים חדשים של חברים";
export const FRIENDS_FOLLOW_HINT =
  "אפשר לסמן חברים ולקבל התראה כשהם מפרסמים. פוסט אנונימי אינו מתריע.";
export const FRIENDS_FOLLOW_EMPTY = "עדיין אין חברים ברשימה";
export const followLabel = (name: string): string =>
  `התראה על פוסט חדש של ${name}`;
export const SAVE_FAILED_TEXT = "לא הצלחנו לשמור את השינוי. אפשר לנסות שוב";
export const SAVED_TEXT = "השינוי נשמר";
