/* ────────────────────────────────────────────────────────────────
   Account settings (migration 031, roadmap #105).
   Profile (name, interests, newsletter choice), feedback sent from
   /account, and account deletion. Server connection only.
──────────────────────────────────────────────────────────────── */
import type { Queryable } from "./db";
import { hasNewsletterLead, insertLead } from "./leadRepo";

export interface AccountSettings {
  userId: string;
  email: string | null;
  displayName: string | null;
  /** Name from the sign-in provider (Google), shown when no name is set. */
  providerName: string | null;
  providers: string[];
  hasPassword: boolean;
  createdAt: string;
  interests: string[];
  newsletter: boolean;
  premium: boolean;
  premiumSince: string | null;
}

export type FeedbackKind = "review" | "request" | "problem" | "other";

export interface FeedbackRow {
  id: number;
  email: string | null;
  displayName: string | null;
  kind: FeedbackKind;
  rating: number | null;
  message: string;
  page: string | null;
  createdAt: string;
  handledAt: string | null;
}

const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());

/**
 * Whether this account gets the newsletter: its own choice when it has made one,
 * otherwise whether its email signed up through a newsletter box.
 */
export async function newsletterSubscribed(db: Queryable, userId: string, email: string | null): Promise<boolean> {
  const res = await db.query(`select newsletter from user_profiles where user_id = $1`, [userId]);
  const choice = res.rows[0]?.newsletter;
  if (choice === true || choice === false) return choice;
  return email ? hasNewsletterLead(db, email) : false;
}

/** Everything the settings page shows. Null when the account doesn't exist. */
export async function getAccountSettings(db: Queryable, userId: string): Promise<AccountSettings | null> {
  const res = await db.query(
    `select u.id, u.email, u.created_at,
            coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as provider_name,
            coalesce(u.raw_app_meta_data->'providers', jsonb_build_array(u.raw_app_meta_data->>'provider')) as providers,
            (u.encrypted_password is not null and u.encrypted_password <> '') as has_password,
            p.display_name, coalesce(p.interests, '{}') as interests,
            coalesce(a.premium, false) as premium, a.premium_since
       from auth.users u
       left join user_profiles p on p.user_id = u.id
       left join user_access a on a.user_id = u.id
      where u.id = $1 and u.deleted_at is null`,
    [userId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const email = r.email == null ? null : String(r.email);
  const providers = Array.isArray(r.providers) ? (r.providers as unknown[]).filter((p): p is string => typeof p === "string") : [];
  return {
    userId: String(r.id),
    email,
    displayName: r.display_name == null ? null : String(r.display_name),
    providerName: r.provider_name == null ? null : String(r.provider_name),
    providers,
    hasPassword: r.has_password === true,
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    interests: Array.isArray(r.interests) ? (r.interests as unknown[]).map(String) : [],
    newsletter: await newsletterSubscribed(db, userId, email),
    premium: r.premium === true,
    premiumSince: iso(r.premium_since),
  };
}

/** Save the fields given; leaves the others as they are. */
export async function saveProfile(db: Queryable, userId: string, patch: { displayName?: string | null; interests?: string[] }): Promise<void> {
  await db.query(
    `insert into user_profiles (user_id, display_name, interests, updated_at)
     values ($1, $3, coalesce($5::text[], '{}'), now())
     on conflict (user_id) do update set
       display_name = case when $2 then excluded.display_name else user_profiles.display_name end,
       interests = case when $4 then excluded.interests else user_profiles.interests end,
       updated_at = now()`,
    [userId, patch.displayName !== undefined, patch.displayName ?? null, patch.interests !== undefined, patch.interests ?? null],
  );
}

/**
 * Record the account's newsletter choice. Subscribing also puts the email on the leads
 * list (once), which is where the weekly send list is taken from.
 */
export async function setNewsletter(db: Queryable, userId: string, email: string, on: boolean, context = "account"): Promise<void> {
  await db.query(
    `insert into user_profiles (user_id, newsletter, newsletter_changed_at, updated_at)
     values ($1, $2, now(), now())
     on conflict (user_id) do update set newsletter = excluded.newsletter, newsletter_changed_at = now(), updated_at = now()`,
    [userId, on],
  );
  if (on && !(await hasNewsletterLead(db, email))) await insertLead(db, { email, context: `newsletter:${context}` });
}

export async function insertFeedback(
  db: Queryable,
  fb: { userId: string; email: string | null; kind: FeedbackKind; rating: number | null; message: string; page: string | null },
): Promise<void> {
  await db.query(
    `insert into user_feedback (user_id, email, kind, rating, message, page) values ($1, $2, $3, $4, $5, $6)`,
    [fb.userId, fb.email, fb.kind, fb.rating, fb.message, fb.page],
  );
}

/** Open messages first, then done ones; newest first within each. For Admin → Messages. */
export async function listFeedback(db: Queryable, limit = 100): Promise<FeedbackRow[]> {
  const res = await db.query(
    `select f.id, coalesce(f.email, u.email) as email, p.display_name, f.kind, f.rating, f.message, f.page, f.created_at, f.handled_at
       from user_feedback f
       left join auth.users u on u.id = f.user_id
       left join user_profiles p on p.user_id = f.user_id
      order by (f.handled_at is null) desc, f.created_at desc
      limit $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    email: r.email == null ? null : String(r.email),
    displayName: r.display_name == null ? null : String(r.display_name),
    kind: String(r.kind) as FeedbackKind,
    rating: r.rating == null ? null : Number(r.rating),
    message: String(r.message),
    page: r.page == null ? null : String(r.page),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    handledAt: iso(r.handled_at),
  }));
}

/** Mark a message done (or not done again). Returns false when there is no such message. */
export async function setFeedbackHandled(db: Queryable, id: number, handled: boolean): Promise<boolean> {
  const res = await db.query(
    `update user_feedback set handled_at = case when $2 then coalesce(handled_at, now()) end where id = $1`,
    [id, handled],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Per-account profile bits for the admin Users table. */
export async function listProfiles(db: Queryable): Promise<Map<string, { displayName: string | null; interests: string[]; newsletter: boolean | null }>> {
  const res = await db.query(`select user_id, display_name, interests, newsletter from user_profiles`);
  return new Map(res.rows.map((r) => [String(r.user_id), {
    displayName: r.display_name == null ? null : String(r.display_name),
    interests: Array.isArray(r.interests) ? (r.interests as unknown[]).map(String) : [],
    newsletter: r.newsletter === true ? true : r.newsletter === false ? false : null,
  }]));
}

/**
 * Delete the account and everything tied to it (profile, Premium row and feedback go
 * by cascade). Newsletter lead rows for the email are removed too. Returns false when
 * there was no such account.
 */
export async function deleteAccount(db: Queryable, userId: string, email: string | null): Promise<boolean> {
  if (email) await db.query(`delete from leads where lower(email) = lower($1)`, [email]);
  const res = await db.query(`delete from auth.users where id = $1`, [userId]);
  return (res.rowCount ?? 0) > 0;
}
