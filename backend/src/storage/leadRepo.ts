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

/** True when this email already signed up for the weekly newsletter
 *  (any page's newsletter box). Case-insensitive on the email. */
export async function hasNewsletterLead(db: Queryable, email: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from leads
      where lower(email) = lower($1) and context like 'newsletter:%'
      limit 1`,
    [email],
  );
  return rows.length > 0;
}
