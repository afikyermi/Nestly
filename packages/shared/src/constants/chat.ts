// Value lists and limits of chat and Support (I8; migration 20261022100000). Held once here; the CHECK constraints messages_body_check,
// chat_requests_opening_message_check, support_requests_topic_check, support_requests_status_check and support_messages_body_check state the same.

/** The longest chat message, opening message, Support request or Support reply, in code points (char_length in the database). */
export const CHAT_TEXT_MAX = 2000;

/** The Support topics (Afik 20.10.2026, decisions-in-force §9.1), in the order the form shows them. */
export const SUPPORT_TOPICS = ['account', 'bug', 'privacy_safety', 'usage', 'suggestion', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** A Support request's status (FR-ADMIN-002). Closed is final. */
export const SUPPORT_STATUSES = ['open', 'in_progress', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Requests to accounts that are not Friends, per account in 24 hours (chat_requests_insert_limit, NS022). */
export const CHAT_REQUESTS_PER_DAY = 20;
/** Chat Blocks per account in 24 hours, lifted ones included (chat_blocks_insert_limit, NS025). */
export const CHAT_BLOCKS_PER_DAY = 20;
/** Support requests per account in 24 hours (support_requests_insert_limit, NS023). */
export const SUPPORT_REQUESTS_PER_DAY = 5;
