// The Admin's status guides (FR-ADMIN-012). Runs inside the caller's identity transaction and nowhere else. Who may read drafts and write
// is the database's: status_guides_select_admin / _insert_admin / _update_admin (caller_staff_role() = 'admin'). No `where` names a user.
import type { AdminGuideDto, GuideValue } from '@nestly/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { IdentityTx } from '../db/identity-transaction.js';
import { statusGuides, statusGuidesInsert, statusGuidesUpdate } from '../db/schema.js';

/** The caller's staff role while the account is active with a valid session, else null (the same helper the policies use). */
export async function readStaffRole(tx: IdentityTx): Promise<string | null> {
  const rows = await tx.execute<{ role: string | null }>(sql`select nestly.caller_staff_role() as role`);
  return rows[0]?.role ?? null;
}

/** Every guide the caller can see: for an Admin, drafts and hidden ones too. */
export async function listGuides(tx: IdentityTx): Promise<AdminGuideDto[]> {
  const rows = await tx
    .select({
      id: statusGuides.id,
      stageKind: statusGuides.stageKind,
      rangeFrom: statusGuides.rangeFrom,
      rangeTo: statusGuides.rangeTo,
      title: statusGuides.title,
      body: statusGuides.body,
      source: statusGuides.source,
      sourceCheckedOn: statusGuides.sourceCheckedOn,
      status: statusGuides.status,
      publishedAt: statusGuides.publishedAt,
    })
    .from(statusGuides)
    .orderBy(asc(statusGuides.stageKind), asc(statusGuides.rangeFrom), asc(statusGuides.createdAt));
  return rows.map((row) => ({ ...row, publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString() }));
}

export async function insertGuide(tx: IdentityTx, value: GuideValue): Promise<void> {
  await tx.insert(statusGuidesInsert).values(value);
}

/** Sets the content and the status of guide `id`. The id picks the target; RLS decides whether it may. The number of rows changed. */
export async function updateGuide(tx: IdentityTx, id: string, value: GuideValue, status: 'draft' | 'published' | 'hidden'): Promise<number> {
  const rows = await tx.update(statusGuidesUpdate).set({ ...value, status }).where(eq(statusGuidesUpdate.id, id)).returning({ id: statusGuidesUpdate.id });
  return rows.length;
}
