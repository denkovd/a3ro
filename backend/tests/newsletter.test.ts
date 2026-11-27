/* Weekly newsletter on Resend (roadmap #36). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inSendWindow, sydneyParts, upcomingIssueDate } from "../src/newsletter/schedule";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "../src/newsletter/unsubscribe";
import { GENERAL_ADVICE_WARNING, renderIssue, UNSUBSCRIBE_PLACEHOLDER, weekOnWeek, type IssueData } from "../src/newsletter/content";
import { personalise, sendDueIssue, type SendEnv } from "../src/newsletter/send";
import type { Queryable, QueryResultLike } from "../src/storage/db";

test("schedule: Monday 6pm Sydney in and out of daylight saving", () => {
  // 1 Dec 2026 is summer (AEDT, UTC+11): Monday 30 Nov 18:05 Sydney = 07:05 UTC.
  assert.deepEqual(sydneyParts(new Date("2026-11-30T07:05:00Z")), { date: "2026-11-30", weekday: 1, hour: 18 });
  assert.equal(inSendWindow(new Date("2026-11-30T07:05:00Z")).open, true);
  assert.equal(inSendWindow(new Date("2026-11-30T06:05:00Z")).open, false); // 5:05pm
  // June is AEST (UTC+10): the 07:05 UTC run is 5:05pm (closed), the 08:05 run is 6:05pm (open).
  assert.equal(inSendWindow(new Date("2026-06-01T07:05:00Z")).open, false);
  assert.equal(inSendWindow(new Date("2026-06-01T08:05:00Z")).open, true);
});

test("schedule: the issue being prepared is the coming Monday", () => {
  assert.equal(upcomingIssueDate(new Date("2026-11-26T02:00:00Z")), "2026-11-30"); // Thursday
  assert.equal(upcomingIssueDate(new Date("2026-11-30T01:00:00Z")), "2026-11-30"); // Monday noon Sydney
  assert.equal(upcomingIssueDate(new Date("2026-11-30T08:00:00Z")), "2026-12-07"); // Monday 7pm: next week
  assert.equal(upcomingIssueDate(new Date("2026-11-29T02:00:00Z")), "2026-11-30"); // Sunday
});

test("unsubscribe tokens: tied to the email, case-insensitive, and verified", () => {
  const t = unsubscribeToken("Reader@Example.com", "s3cret");
  assert.equal(verifyUnsubscribeToken("reader@example.com", t, "s3cret"), true);
  assert.equal(verifyUnsubscribeToken("someone@example.com", t, "s3cret"), false);
  assert.equal(verifyUnsubscribeToken("reader@example.com", t, "other"), false);
  assert.equal(verifyUnsubscribeToken("reader@example.com", "short", "s3cret"), false);
  const url = new URL(unsubscribeUrl("https://a3ro.com.au", "Reader@Example.com", "s3cret"));
  assert.equal(url.pathname, "/unsubscribe");
  assert.equal(url.searchParams.get("e"), "reader@example.com");
});

test("weekOnWeek: needs 14 days, compares the latest 7 with the 7 before", () => {
  assert.equal(weekOnWeek([1, 2, 3]), null);
  const w = weekOnWeek([...Array(7).fill(22), ...Array(7).fill(20)])!;
  assert.equal(w.last7, 22);
  assert.equal(Math.round(w.changePct), 10);
});

const DATA: IssueData = {
  issueDate: "2026-11-30", generatedAt: "2026-11-26T00:00:00Z",
  pulse: { label: "Leading indicators improving, price pressure easing", growth: { state: "up", up: 5, down: 2 }, inflation: { state: "down", up: 1, down: 3 },
    moved: [{ label: "Building approvals", period: "2026-10", zChange: 1.42 }] },
  macro: { quadrant: "GOLDILOCKS", headline: "Growth firm, inflation cooling", runDate: "2026-11-26",
    weather: { emoji: "☀️", label: "Sunny", reasons: ["Economy and markets agree"] }, liquidity: "Liquidity calm" },
  oil: { chokepoints: [{ name: "Strait of Hormuz", last7: 41.3, prior7: 39, changePct: 5.9, through: "2026-11-22" }],
    crudeStocks: { value: 417.8, change: 3.4, date: "2026-11-13" }, wti: { value: 71.25, change: -1.1, date: "2026-11-17" } },
};

test("renderIssue: weather, warning, unsubscribe placeholder, escaped text", () => {
  const r = renderIssue({ ...DATA, macro: { ...DATA.macro!, headline: "Growth <firm> & steady" } });
  assert.match(r.subject, /^A3RO weekly · 30 November 2026 · 🇺🇸 ☀️ Sunny$/);
  for (const part of ["Macro weather", "US: ☀️ Sunny", GENERAL_ADVICE_WARNING]) {
    assert.ok(r.text.toLowerCase().includes(part.toLowerCase()), `text has ${part}`);
  }
  assert.ok(r.html.includes("Growth &lt;firm&gt; &amp; steady"));
  assert.ok(!r.html.includes("<firm>"));
  assert.ok(r.html.includes(UNSUBSCRIBE_PLACEHOLDER) && r.text.includes(UNSUBSCRIBE_PLACEHOLDER));
});

test("renderIssue: missing sections are left out, not shown empty", () => {
  const r = renderIssue({ ...DATA, pulse: null, macro: null, oil: null });
  assert.equal(r.subject, "A3RO weekly · 30 November 2026");
  assert.ok(!/MACRO WEATHER|WHAT'S FLIPPED|EXECUTE/i.test(r.text));
});

const ENV: SendEnv = { resend: { apiKey: "re_test", from: "A3RO <newsletter@a3ro.com.au>" }, siteUrl: "https://a3ro.com.au", secret: "s3cret" };

test("personalise: each copy gets its own unsubscribe link, also as List-Unsubscribe", () => {
  const e = personalise({ subject: "S", html: `<a href="${UNSUBSCRIBE_PLACEHOLDER}">x</a>`, text: `U: ${UNSUBSCRIBE_PLACEHOLDER}` }, "a@b.com", ENV, "[Test] ");
  assert.equal(e.subject, "[Test] S");
  assert.ok(!e.html.includes(UNSUBSCRIBE_PLACEHOLDER) && !e.text.includes(UNSUBSCRIBE_PLACEHOLDER));
  assert.ok(e.text.includes("e=a%40b.com&t="));
  assert.ok(e.html.includes("e=a%40b.com&amp;t="));
  assert.equal(e.unsubscribeUrl, unsubscribeUrl("https://a3ro.com.au", "a@b.com", "s3cret"));
});

/* ── sending through a fake DB and a fake Resend ── */

function sendHarness(recipients: string[], status = "approved", failOnBatch = -1, premiumUsers: string[] = []) {
  const issue = { id: 1, issue_date: "2026-11-30", subject: "S", html: `<a href="${UNSUBSCRIBE_PLACEHOLDER}">u</a>`, text_body: "t",
    subject_premium: premiumUsers.length ? "SP" : null, html_premium: premiumUsers.length ? `P <a href="${UNSUBSCRIBE_PLACEHOLDER}">u</a>` : null, text_premium: premiumUsers.length ? "tp" : null,
    status, created_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:00:00Z", sent_count: 0, failed_count: 0 };
  const sent = new Set<string>();
  const db: Queryable = {
    async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
      if (text.startsWith("select * from newsletter_issues where issue_date")) return { rows: params[0] === issue.issue_date ? [{ ...issue }] : [] };
      if (text.includes("set status = 'sending'")) {
        if (issue.status !== "approved") return { rows: [], rowCount: 0 };
        issue.status = "sending"; return { rows: [], rowCount: 1 };
      }
      if (text.includes("from user_access a join auth.users")) return { rows: premiumUsers.map((email) => ({ email })) };
      if (text.includes("from leads l")) return { rows: recipients.filter((e) => !sent.has(e)).map((email) => ({ email })) };
      if (text.startsWith("insert into newsletter_sends")) {
        for (let i = 1; i < params.length; i += 3) sent.add(String(params[i]));
        return { rows: [], rowCount: (params.length - 1) / 3 };
      }
      if (text.includes("status = case when $2 then 'sent' else 'approved' end")) {
        issue.status = params[1] ? "sent" : "approved"; return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const batches: { to: string[]; key: string | null; listUnsub: string | undefined; subjects: string[] }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { to: string[]; subject: string; headers?: Record<string, string> }[];
    if (batches.length === failOnBatch) { batches.push({ to: [], key: null, listUnsub: undefined, subjects: [] }); return new Response(JSON.stringify({ message: "rate limited" }), { status: 429 }); }
    batches.push({ to: body.flatMap((b) => b.to), key: (init.headers as Record<string, string>)["Idempotency-Key"] ?? null, listUnsub: body[0]?.headers?.["List-Unsubscribe"], subjects: body.map((b) => b.subject) });
    return new Response(JSON.stringify({ data: body.map((_, i) => ({ id: `re_${batches.length}_${i}` })) }), { status: 200 });
  }) as unknown as typeof fetch;
  return { db, issue, sent, batches, env: { ...ENV, resend: { ...ENV.resend, fetchImpl } } };
}

const MONDAY_6PM = new Date("2026-11-30T07:05:00Z");

test("send: only an approved issue, only in the Monday 6pm window", async () => {
  const early = sendHarness(["a@x.com"]);
  assert.equal((await sendDueIssue(early.db, early.env, { now: new Date("2026-11-30T05:00:00Z") })).status, "not send time");
  const draft = sendHarness(["a@x.com"], "draft");
  assert.equal((await sendDueIssue(draft.db, draft.env, { now: MONDAY_6PM })).status, "not approved");
  assert.equal(draft.batches.length, 0);
});

test("send: batches of 100, everyone once, then marked sent", async () => {
  const list = Array.from({ length: 230 }, (_, i) => `r${String(i).padStart(3, "0")}@x.com`);
  const h = sendHarness(list);
  const report = await sendDueIssue(h.db, h.env, { now: MONDAY_6PM });
  assert.equal(report.status, "sent");
  assert.equal(report.sent, 230);
  assert.deepEqual(h.batches.map((b) => b.to.length), [100, 100, 30]);
  assert.equal(new Set(h.batches.flatMap((b) => b.to)).size, 230);
  assert.ok(h.batches.every((b) => b.key) && h.batches[0].listUnsub?.startsWith("<https://a3ro.com.au/unsubscribe?"));
  assert.equal(h.issue.status, "sent");
  // A second run (the 08:05 UTC cron) sends nothing.
  assert.equal((await sendDueIssue(h.db, h.env, { now: new Date("2026-11-30T08:05:00Z") })).status, "already sent");
  assert.equal(h.batches.length, 3);
});

test("send: a failed batch stops the run, and the next run sends only to who's left", async () => {
  const list = Array.from({ length: 150 }, (_, i) => `r${String(i).padStart(3, "0")}@x.com`);
  const h = sendHarness(list, "approved", 1);
  const first = await sendDueIssue(h.db, h.env, { now: MONDAY_6PM });
  assert.equal(first.status, "partly sent");
  assert.equal(first.sent, 100);
  assert.match(first.error ?? "", /429/);
  assert.equal(h.issue.status, "approved");
  const second = await sendDueIssue(h.db, h.env, { now: new Date("2026-11-30T08:05:00Z") });
  assert.equal(second.status, "sent");
  assert.equal(second.sent, 50);
  assert.equal(h.sent.size, 150);
});

test("send: Premium readers and owners get the Premium edition, everyone else the free one", async () => {
  const h = sendHarness(["free@x.com", "paid@x.com", "owner@x.com"], "approved", -1, ["paid@x.com"]);
  h.env.ownerEmails = ["Owner@x.com"];
  const report = await sendDueIssue(h.db, h.env, { now: MONDAY_6PM });
  assert.equal(report.status, "sent");
  const bySubject = Object.fromEntries(h.batches[0].to.map((to, i) => [to, h.batches[0].subjects[i]]));
  assert.deepEqual(bySubject, { "free@x.com": "S", "paid@x.com": "SP", "owner@x.com": "SP" });
});
