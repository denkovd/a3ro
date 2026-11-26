/* Account settings repo (#105): newsletter choice vs the leads list. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { newsletterSubscribed, setNewsletter } from "../src/storage/userProfileRepo";
import type { Queryable, QueryResultLike } from "../src/storage/db";

function fakeDb(state: { choice?: boolean | null; changedAt?: string; unsubscribedAt?: string; leads: { email: string; context: string }[] }): Queryable {
  return {
    async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
      if (text.includes("select newsletter") && text.includes("from user_profiles")) return { rows: state.choice === undefined ? [] : [{ newsletter: state.choice, newsletter_changed_at: state.changedAt ?? null }] };
      if (text.startsWith("delete from newsletter_unsubscribes")) { delete state.unsubscribedAt; return { rows: [], rowCount: 1 }; }
      if (text.includes("from newsletter_unsubscribes")) return { rows: state.unsubscribedAt ? [{ unsubscribed_at: state.unsubscribedAt }] : [] };
      if (text.includes("from leads")) {
        const email = String(params[0]).toLowerCase();
        return { rows: state.leads.filter((l) => l.email.toLowerCase() === email && l.context.startsWith("newsletter:")).map(() => ({ "?column?": 1 })) };
      }
      if (text.includes("insert into user_profiles")) { state.choice = params[1] as boolean; return { rows: [], rowCount: 1 }; }
      if (text.includes("insert into leads")) { state.leads.push({ email: String(params[0]), context: String(params[2]) }); return { rows: [], rowCount: 1 }; }
      throw new Error(`unhandled SQL: ${text.slice(0, 60)}`);
    },
  };
}

test("before choosing, a newsletter lead for the email counts as subscribed", async () => {
  assert.equal(await newsletterSubscribed(fakeDb({ leads: [{ email: "A@b.com", context: "newsletter:asset:x" }] }), "u1", "a@b.com"), true);
  assert.equal(await newsletterSubscribed(fakeDb({ leads: [{ email: "a@b.com", context: "pro-request" }] }), "u1", "a@b.com"), false);
});

test("the account's own choice wins over the leads list", async () => {
  const state = { choice: false as boolean | null, leads: [{ email: "a@b.com", context: "newsletter:australia-watch" }] };
  assert.equal(await newsletterSubscribed(fakeDb(state), "u1", "a@b.com"), false);
});

test("subscribing adds one lead; unsubscribing adds none", async () => {
  const state: { choice?: boolean | null; leads: { email: string; context: string }[] } = { leads: [] };
  const db = fakeDb(state);
  await setNewsletter(db, "u1", "a@b.com", true);
  await setNewsletter(db, "u1", "a@b.com", true);
  assert.deepEqual(state.leads, [{ email: "a@b.com", context: "newsletter:account" }]);
  await setNewsletter(db, "u1", "a@b.com", false);
  assert.equal(state.choice, false);
  assert.equal(state.leads.length, 1);
  assert.equal(await newsletterSubscribed(db, "u1", "a@b.com"), false);
});

test("an unsubscribe link clicked after the account's choice wins; subscribing again lifts it", async () => {
  const state: { choice?: boolean | null; changedAt?: string; unsubscribedAt?: string; leads: { email: string; context: string }[] } =
    { choice: true, changedAt: "2026-11-01T00:00:00Z", unsubscribedAt: "2026-11-20T00:00:00Z", leads: [{ email: "a@b.com", context: "newsletter:account" }] };
  const db = fakeDb(state);
  assert.equal(await newsletterSubscribed(db, "u1", "a@b.com"), false);
  await setNewsletter(db, "u1", "a@b.com", true);
  assert.equal(state.unsubscribedAt, undefined);
  assert.equal(await newsletterSubscribed(db, "u1", "a@b.com"), true);
});
