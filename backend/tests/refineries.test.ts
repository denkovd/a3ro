import { test } from "node:test";
import assert from "node:assert/strict";
import { REFINERIES, refineryCondition, mergeRefineryEvents, type RefineryEvent } from "../../lib/oil/refineries";
import { extractOfficialEvent, officialArticleLinks } from "../src/refineries/sourceRules";
import { runRefineryCycle } from "../src/ingest/refineryCycle";
import { parsePublicEiaWorkbook } from "../src/sources/eiaPublic";
import * as XLSX from "xlsx";

const now = Date.parse("2026-10-10T12:00:00Z");
const base = REFINERIES[0];
const event = (kind: RefineryEvent["kind"], overrides: Partial<RefineryEvent> = {}): RefineryEvent => ({ id: "case-1", incidentId: "incident-1", kind, date: "2026-10-08", title: "Reported event", detail: "", sourceUrl: "https://operator.example/report", scope: "facility", verifiedAt: "2026-10-09", ...overrides });

test("temporary conditions expire on evidence age, even when a source is fetched today", () => {
  assert.equal(refineryCondition({ ...base, events: [event("outage")] }, now).status, "outage");
  assert.equal(refineryCondition({ ...base, events: [event("outage", { date: "2026-03-09", verifiedAt: "2026-10-10" })] }, now).status, "unknown");
  assert.equal(refineryCondition({ ...base, events: [event("maintenance", { verifiedAt: "2026-09-01" })] }, now).status, "unknown");
});

test("group and unit reports do not establish a facility outage", () => {
  for (const scope of ["group", "unit"] as const) assert.equal(refineryCondition({ ...base, events: [event("outage", { scope })] }, now).status, "unknown");
});

test("Bazan unit references never become quantified unavailable capacity or a current outage", () => {
  const bazan = REFINERIES.find(r => r.id === "haifa-bazan")!;
  assert.equal(bazan.capacityKbd, 197);
  assert.equal(bazan.units?.find(u => u.name === "Hydrocracker (HCU)")?.capacityKbd, 36);
  assert.ok(bazan.events.every(e => e.affectedCapacityKbd == null));
  assert.ok(bazan.events.every(e => !e.publishedAt));
  assert.equal(refineryCondition(bazan, Date.parse("2026-10-11T12:00:00Z")).status, "unknown");
});

test("closure/idling remain structural until a later facility report supersedes them", () => {
  const closure = event("closure", { id: "old", date: "2025-04", verifiedAt: "2025-04" });
  assert.equal(refineryCondition({ ...base, events: [closure] }, now).status, "closed");
  assert.equal(refineryCondition({ ...base, events: [closure, event("restart")] }, now).status, "restart");
  assert.equal(refineryCondition({ ...base, events: [closure, event("notice", { scope: "group" })] }, now).status, "closed");
  assert.equal(refineryCondition({ ...base, events: [closure, event("notice")] }, now).status, "closed");
  assert.equal(refineryCondition({ ...base, events: [event("maintenance", { date: "2026-11-01", publishedAt: "2026-10-08" })] }, now).status, "scheduled");
  assert.equal(refineryCondition({ ...base, events: [event("closure", { date: "2026-11-01" })] }, now).status, "scheduled");
  assert.equal(refineryCondition({ ...base, events: [closure, event("restart", { date: "2026-11-01" })] }, now).status, "closed");
});

test("rechecking an official page preserves its publication date and deduplicates evidence", () => {
  const e = event("outage", { date: "2026-03-09", publishedAt: "2026-03-09" });
  const rule = { id: "rule", refineryId: base.id, url: e.sourceUrl, event: e, required: [/refinery halted/i] };
  const parsed = extractOfficialEvent(rule, "<h1>Refinery halted</h1>", "2026-10-10T12:00:00Z");
  assert.equal(parsed.publishedAt, "2026-03-09T00:00:00.000Z");
  assert.equal(extractOfficialEvent({ ...rule, event: { ...e, date: "2026-04", publishedAt: undefined } }, "<h1>Refinery halted</h1>", "2026-10-10T12:00:00Z").publishedAt, null);
  assert.equal(mergeRefineryEvents({ ...base, events: [e] }, [parsed]).length, 1);
  assert.throws(() => extractOfficialEvent(rule, "<h1>Corporate update</h1>"), /no longer matches/);
});

test("official discovery stays on the operator origin and excludes unrelated news", () => {
  const html = '<a href="/media-centre/press-releases/refinery-restart">Refinery restart announcement</a><a href="https://evil.example/media-centre/press-releases/refinery">Refinery fake report</a><a href="/media-centre/press-releases/scholarships">Scholarship recipients announced</a>';
  assert.deepEqual(officialArticleLinks(html, "https://operator.example/media-centre/press-releases"), [{ url: "https://operator.example/media-centre/press-releases/refinery-restart", title: "Refinery restart announcement" }]);
});

test("one unavailable official statement cannot prevent other evidence from being stored", async () => {
  const writes: string[] = [];
  const db = { query: async (sql: string, args?: unknown[]) => {
    if (sql.includes("jsonb_to_recordset")) writes.push(...JSON.parse(String(args![0])).map((r: { id: string }) => r.id));
    return { rows: [], rowCount: 1 };
  } };
  const report = await runRefineryCycle(db, { now: () => new Date(now), fetchPage: async url => {
    if (url.includes("grangemouth")) return "April 2025 operations ceased";
    throw new Error("Provider unavailable");
  } });
  assert.ok(writes.some(id => id.startsWith("grangemouth")));
  assert.ok(report.polled.some(p => p.ok));
  assert.ok(report.polled.some(p => !p.ok));
  assert.ok(report.polled.every(p => !p.sourceId.startsWith("bazan-")), "manual PDF evidence must not be renewed with an unrelated default rule");
});

test("public EIA serial dates are timezone-independent and wrong series are rejected", () => {
  const book = XLSX.utils.book_new();
  const serial = (Date.UTC(2026,9,2) - Date.UTC(1899,11,30)) / 86_400_000;
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Sourcekey","WPULEUS3"],["Date","Utilization"],[serial,92.7],[serial + 7,null]]), "Data 1");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.deepEqual(parsePublicEiaWorkbook(bytes, "WPULEUS3"), [{ period: "2026-10-02", value: 92.7, series: "WPULEUS3" }]);
  assert.throws(() => parsePublicEiaWorkbook(bytes, "OTHER_SERIES"), /does not match/);
});
