// The registration account's rows (I1 F1.4 part b; schema.md "Write order"). Runs inside the caller's identity
// transaction and nowhere else. Inserts only through the `*Insert` write models: they name exactly the columns granted
// INSERT, so ids, owners and clocks always take the database's defaults (platform rules 12, 13). Each table is its own
// statement, in the order the policies need: `users` first, because every later policy reads it (is_active_account).
// Permission is the database's: no statement here filters or checks who the caller is.

import type { RegistrationChild, JourneyStage, ParentGender } from '@nestly/shared';
import {
  childrenInsert,
  journeyContextsInsert,
  legalConsentsInsert,
  regularProfilesInsert,
  users,
  usersInsert,
} from '../db/schema.js';
import type { IdentityTx } from '../db/identity-transaction.js';

export interface NewRegularAccount {
  readonly fullName: string;
  readonly parentGender: ParentGender | null;
  /** One per ticked stage; the due date only on `pregnant` (journey_contexts_due_date_check). */
  readonly journeys: readonly { readonly stage: JourneyStage; readonly dueDate: string | null }[];
  /** In entry order: the first gets slot 1. */
  readonly children: readonly RegistrationChild[];
  readonly consent: { readonly termsVersion: string; readonly privacyVersion: string };
}

/** Whether the caller's own `users` row is visible to them (RLS: own row, any status). A suspended account reads true. */
export async function accountExists(tx: IdentityTx): Promise<boolean> {
  const rows = await tx.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

/** Creates the whole account. Any failing statement throws; the caller's transaction then rolls everything back. */
export async function insertRegularAccount(tx: IdentityTx, account: NewRegularAccount): Promise<void> {
  await tx.insert(usersInsert).values({ accountType: 'regular', status: 'active' });
  await tx.insert(regularProfilesInsert).values({ fullName: account.fullName, gender: account.parentGender });
  await tx
    .insert(journeyContextsInsert)
    .values(account.journeys.map((journey) => ({ stage: journey.stage, dueDate: journey.dueDate })));
  if (account.children.length > 0) {
    await tx.insert(childrenInsert).values(
      account.children.map((child, index) => ({
        slot: index + 1,
        name: child.name,
        sex: child.sex,
        birthDate: child.birthDate,
      })),
    );
  }
  await tx.insert(legalConsentsInsert).values({
    termsVersion: account.consent.termsVersion,
    privacyVersion: account.consent.privacyVersion,
    hasDeclared18Plus: true,
  });
}
