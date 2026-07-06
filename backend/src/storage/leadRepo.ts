/* ────────────────────────────────────────────────────────────────
   Repository layer for leads — sibling to corridorRepo.ts. The only
   module that writes SQL for the leads table. app/api/leads calls
   insertLead directly; there is no read path yet (leads are consumed
   out-of-band, not surfaced back to the client).
──────────────────────────────────────────────────────────────── */

import { Queryable } from "./db";

/** Insert one pro-tier access request. message/context are optional
 *  and stored as null (not undefined) when absent. */
export async function insertLead(
  db: Queryable,
  lead: { email: string; message?: string; context?: string },
): Promise<void> {
  await db.query(
    `insert into leads (email, message, context)
     values ($1,$2,$3)`,
    [lead.email, lead.message ?? null, lead.context ?? null],
  );
}
