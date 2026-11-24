/* ────────────────────────────────────────────────────────────────
   Accounts and Premium access (migration 029).
   Reads Supabase's auth.users over the server connection (never the
   browser) and the user_access table that says who has Premium.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "./db";

export interface AccountRow {
  userId: string;
  email: string | null;
  provider: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  premium: boolean;
  premiumSince: string | null;
  source: "admin" | "stripe" | null;
  updatedBy: string | null;
}

const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());

/** Every account, newest first, with its Premium state. */
export async function listAccounts(db: Queryable, limit = 500): Promise<AccountRow[]> {
  const res = await db.query(
    `select u.id, u.email, u.raw_app_meta_data->>'provider' as provider, u.created_at, u.last_sign_in_at,
            u.email_confirmed_at is not null as email_confirmed,
            coalesce(a.premium, false) as premium, a.premium_since, a.source, a.updated_by
       from auth.users u
       left join user_access a on a.user_id = u.id
      where u.deleted_at is null
      order by u.created_at desc
      limit $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    userId: String(r.id),
    email: r.email == null ? null : String(r.email),
    provider: r.provider == null ? null : String(r.provider),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    lastSignInAt: iso(r.last_sign_in_at),
    emailConfirmed: r.email_confirmed === true,
    premium: r.premium === true,
    premiumSince: iso(r.premium_since),
    source: r.source == null ? null : (String(r.source) as "admin" | "stripe"),
    updatedBy: r.updated_by == null ? null : String(r.updated_by),
  }));
}

/** Whether this account has Premium. Unknown accounts and missing rows are not Premium. */
export async function hasPremium(db: Queryable, userId: string): Promise<boolean> {
  const res = await db.query(`select premium from user_access where user_id = $1`, [userId]);
  return res.rows[0]?.premium === true;
}

/** Switch Premium on or off for an account. Returns false when no such account exists. */
export async function setPremium(db: Queryable, userId: string, premium: boolean, opts: { by: string; source?: "admin" | "stripe" }): Promise<boolean> {
  const res = await db.query(
    `insert into user_access (user_id, premium, source, premium_since, updated_at, updated_by)
     select u.id, $2, $3, case when $2 then now() end, now(), $4 from auth.users u where u.id = $1
     on conflict (user_id) do update set
       premium = excluded.premium,
       source = excluded.source,
       premium_since = case when excluded.premium and not user_access.premium then now()
                            when excluded.premium then user_access.premium_since end,
       updated_at = now(),
       updated_by = excluded.updated_by`,
    [userId, premium, opts.source ?? "admin", opts.by],
  );
  return (res.rowCount ?? 0) > 0;
}
