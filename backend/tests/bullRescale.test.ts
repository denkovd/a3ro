/* Roadmap #104: stored bars left on a pre-split scale. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRescale } from "../src/bull/rescale";
import { runBullScan } from "../src/bull/pipeline";
import { AdapterRegistry } from "../src/bull/adapters";
import { BarRange, BullUniverseEntry, RegimeBar } from "../src/bull/types";
import { Queryable, QueryResultLike } from "../src/storage/db";

function dateSeq(start: string, days: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < days; i++) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const bar = (date: string, close: number): RegimeBar => ({ date, open: close, high: close, low: close, close });

test("detectRescale: matching closes are not a split", () => {
  const dates = dateSeq("2026-06-01", 20);
  const stored = dates.map((d, i) => bar(d, 100 + i));
  const fresh = dates.map((d, i) => bar(d, 100 + i + 0.3)); // small revisions only
  const r = detectRescale(stored, fresh);
  assert.equal(r.rescaled, false);
  assert.equal(r.compared, 19); // newest stored bar skipped
});

test("detectRescale: a 2-for-1 split inside the window is caught with its ratio", () => {
  const dates = dateSeq("2026-06-01", 20);
  // Split on 06-10: stored still has pre-split closes (~200) before it; the fresh fetch is rescaled (~100).
  const stored = dates.map((d) => bar(d, d < "2026-06-10" ? 200 : 100));
  const fresh = dates.map((d) => bar(d, 100));
  const r = detectRescale(stored, fresh);
  assert.equal(r.rescaled, true);
  assert.equal(r.mismatches, 9);
  assert.equal(r.ratio, 2);
});

test("detectRescale: one odd bar or a moved last (mid-session) bar is not enough", () => {
  const dates = dateSeq("2026-06-01", 20);
  const fresh = dates.map((d) => bar(d, 100));
  const oneBlip = fresh.map((b, i) => (i === 5 ? bar(b.date, 110) : b));
  assert.equal(detectRescale(oneBlip, fresh).rescaled, false);
  const lastMoved = fresh.map((b, i) => (i === fresh.length - 1 ? bar(b.date, 120) : b));
  assert.equal(detectRescale(lastMoved, fresh).rescaled, false);
});

test("detectRescale: no overlap means nothing to judge", () => {
  const r = detectRescale([bar("2026-01-01", 50)], [bar("2026-06-01", 100)]);
  assert.deepEqual(r, { rescaled: false, compared: 0, mismatches: 0, ratio: null });
});

/* ── through the scan: a split stock gets its whole history replaced ── */

class FakeDb implements Queryable {
  bars = new Map<string, Map<string, RegimeBar>>();
  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    const m = () => this.bars.get(`${params[0]}|${params[1]}`) ?? new Map<string, RegimeBar>();
    if (text.includes("select max(date) as d from market_bars")) {
      const dates = [...m().keys()].sort();
      return { rows: [{ d: dates[dates.length - 1] ?? null }] };
    }
    if (text.startsWith("insert into market_bars")) {
      for (let i = 0; i < params.length; i += 7) {
        const [symbol, series, date, open, high, low, close] = params.slice(i, i + 7) as [string, string, string, number, number, number, number];
        const k = `${symbol}|${series}`;
        if (!this.bars.has(k)) this.bars.set(k, new Map());
        this.bars.get(k)!.set(date, { date, open, high, low, close });
      }
      return { rows: [], rowCount: params.length / 7 };
    }
    if (text.includes("select date, open, high, low, close from market_bars")) {
      const from = params[2] == null ? "" : String(params[2]);
      return { rows: [...m().values()].filter((b) => b.date >= from).sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => ({ ...b })) };
    }
    if (text.startsWith("delete from market_bars")) {
      const map = m(); let n = 0;
      for (const d of [...map.keys()]) if (d < String(params[2])) { map.delete(d); n++; }
      return { rows: [], rowCount: n };
    }
    if (text.includes("from bull_snapshots")) return { rows: [] };
    return { rows: [], rowCount: 0 };
  }
}

test("scan: a symbol split since its last fetch gets 5y re-fetched and old-scale bars removed", async () => {
  const RUN = "2026-07-05";
  const all = dateSeq("2026-01-01", 185); // through 2026-07-04
  const SPLIT = "2026-06-20";
  // What the source returns now: the whole history already divided by 2 before the split.
  const fresh5y = all.map((d, i) => bar(d, (d < SPLIT ? 200 + i : 100 + i) / (d < SPLIT ? 2 : 1)));
  const fresh1mo = fresh5y.slice(-30);
  const calls: BarRange[] = [];
  const registry: AdapterRegistry = {
    get: (id) => ({ id, async fetchDailyBars(_s: string, range: BarRange) { calls.push(range); return range === "5y" ? fresh5y : fresh1mo; } }),
  };
  const db = new FakeDb();
  // Stored before the split: an extra older bar (2025-12-31) and pre-split closes up to 06-19.
  const stored = new Map<string, RegimeBar>();
  stored.set("2025-12-31", bar("2025-12-31", 199));
  all.filter((d) => d < SPLIT).forEach((d, i) => stored.set(d, bar(d, 200 + i)));
  db.bars.set("MNST|adj", stored);

  const universe: BullUniverseEntry[] = [{ symbol: "MNST", displayName: "Monster", tier: "equity", assetClass: "equity", adapters: ["yahoo"] } as BullUniverseEntry];
  const report = await runBullScan(db, { universe, registry, now: () => new Date(`${RUN}T12:00:00Z`) });

  assert.deepEqual(report.rescaled, ["MNST"]);
  assert.deepEqual(calls, ["1mo", "5y"]);
  const after = db.bars.get("MNST|adj")!;
  assert.equal(after.has("2025-12-31"), false, "bars older than the fresh window are removed");
  for (const b of fresh5y) assert.equal(after.get(b.date)?.close, b.close);
});

test("scan: an unsplit symbol only fetches the 1mo window", async () => {
  const all = dateSeq("2026-01-01", 185);
  const series = all.map((d, i) => bar(d, 100 + i));
  const calls: BarRange[] = [];
  const registry: AdapterRegistry = {
    get: (id) => ({ id, async fetchDailyBars(_s: string, range: BarRange) { calls.push(range); return range === "5y" ? series : series.slice(-30); } }),
  };
  const db = new FakeDb();
  db.bars.set("APH|adj", new Map(series.slice(0, -3).map((b) => [b.date, { ...b }])));
  const universe = [{ symbol: "APH", displayName: "Amphenol", tier: "equity", assetClass: "equity", adapters: ["yahoo"] } as BullUniverseEntry];
  const report = await runBullScan(db, { universe, registry, now: () => new Date("2026-07-05T12:00:00Z") });
  assert.deepEqual(report.rescaled, []);
  assert.deepEqual(calls, ["1mo"]);
});
