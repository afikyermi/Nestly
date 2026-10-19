// Limits of the comments schema (I3 F3.3; migration 20261019100000). Held once here; the CHECK comments_body_length_check states the same.

/**
 * The longest comment or reply text, in code points (F3.3 criterion 1; "SRS gap": the VAL id is assigned at I3's SRS update). The database
 * enforces the same number with `char_length(body) <= 1000` (comments_body_length_check), so a change is a migration and this constant together.
 */
export const COMMENT_BODY_MAX = 1000;

/** Top-level comments on one page of a thread (F3.3 criterion 8). Replies are not counted: they come with their parent. */
export const COMMENT_PAGE_SIZE = 20;
