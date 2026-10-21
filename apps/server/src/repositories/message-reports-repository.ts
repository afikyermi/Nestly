// A reported chat message, as staff open it (I8, Afik 20.10.2026, decisions-in-force §9.6). Runs inside the caller's identity transaction, on the
// admin screens (nestly.staff_view). Staff never read a conversation: the one reported message is readable only after this transaction recorded a
// view of a report on it (reported_message_views; audit_trigger writes the Audit entry in the same transaction), and only inside it
// (messages_select_staff). The text is never copied into the report.

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { IdentityTx } from '../db/identity-transaction.js';

const isoMs = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);

/** Records the view (audited) and reads the message; undefined when no report the caller reads names it. */
export async function openReportedMessage(tx: IdentityTx, messageId: string): Promise<{ text: string; sentAt: string; senderId: string } | undefined> {
  const viewed = await tx.execute(sql`
    insert into nestly.reported_message_views (report_id)
    select r.id from nestly.reports r where r.message_id = ${messageId}::uuid order by r.created_at, r.id limit 1
    returning id`);
  if (viewed.length === 0) return undefined;
  const [row] = z.array(z.object({ text: z.string(), sentAt: z.string(), senderId: z.guid() })).parse(
    await tx.execute(sql`
      select m.body as text, to_char(m.created_at at time zone 'UTC', ${isoMs}) as "sentAt", m.sender_id as "senderId"
      from nestly.messages m where m.id = ${messageId}::uuid`),
  );
  return row;
}
