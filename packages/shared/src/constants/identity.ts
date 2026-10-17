// Value lists of the identity schema (I1 F1.1 part b). Held once here; the Drizzle schema declares its text enums
// from them, and the CHECK constraints of supabase/migrations/20261014100000_identity_schema.sql list the same values.
// Lowercase snake_case, stored as text (schema.md "Conventions": enums).

/** SRS Role (§3, BR-016). Fixed when the account is created; Regular and Professional are separate accounts. */
export const ACCOUNT_TYPES = ['regular', 'professional', 'admin', 'moderator'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Whether the account may use the product now (FR-MOD-002, BR-024). A warning is not a status. */
export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** The parent's gender (VAL-006, OP-004 closed). Optional: no answer is stored as null, not as a value here. */
export const PARENT_GENDERS = ['woman', 'man', 'other', 'prefer_not_to_say'] as const;
export type ParentGender = (typeof PARENT_GENDERS)[number];

/** Who outside Friends sees the full profile (FR-PRIV-001, §1.4 Regular Profile Visibility). Default open (Afik, I2 questionnaire 1). */
export const PROFILE_VISIBILITIES = ['open', 'restricted'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
