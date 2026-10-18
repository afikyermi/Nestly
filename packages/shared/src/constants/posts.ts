// Value lists and limits of the posts schema (I3 F3.0a/F3.1; migrations 20261018100000, 20261018200000). Held once here; the Drizzle schema
// declares its text enum from it, and the CHECK constraints posts_audience_value_check and posts_body_length_check state the same.

/** OP-033: who may see a post. Per post, never a profile setting. */
export const POST_AUDIENCES = ['everyone', 'friends'] as const;
export type PostAudience = (typeof POST_AUDIENCES)[number];

/**
 * The longest post text, in code points (F3.1 criterion 1; "SRS gap": the VAL id is assigned at I3's SRS update). The database
 * enforces the same number with `char_length(body) <= 2000` (posts_body_length_check), so a change is a migration and this constant together.
 */
export const POST_BODY_MAX = 2000;
