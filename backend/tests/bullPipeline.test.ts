/* ────────────────────────────────────────────────────────────────
   Scan pipeline integration — fake DB + stub adapters. Proves:
   - per-symbol isolation (BTC-USD fetch fails; CL=F and ^GSPC scan)
   - a full CL=F roll cycle THROUGH the pipeline: detection from
     dated contracts, adj-series back-shift in storage, audit row,
     verification probe, present bar untouched
   - idempotence: re-running the same day never double-shifts
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runBullScan } from "../src/bull/pipeline";
import { AdapterRegistry } from "../src/bull/adapters";
import { BullUniverseEntry, RegimeBar } from "../src/bull/types";
import { Queryable, QueryResultLike } from "../src/storage/db";

/* ── fixtures ─────────────────────────────────────────────────── */

const RUN_DATE = "2026-07-05";

function dateSeq(start: string, days: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const mkBar = (date: string, close: number): RegimeBar =>
  ({ date, open: close, high: close + 0.5, low: close - 0.5, close });

// 30 daily CL bars, 2026-06-05 … 2026-07-04. The continuous tracks
// the OLD contract (close ≈ 80) through 06-27 and the NEW contract
// (close ≈ 81) from 06-28 → roll on 06-28, gap +1.
const CL_DATES = dateSeq("2026-06-05", 30);
const ROLL_DATE = "2026-06-28";
const OLD_C = 80, NEW_C = 81;
const CL_RAW: RegimeBar[] = CL_DATES.map((d) =>
  mkBar(d, d < ROLL_DATE ? OLD_C : NEW_C));
// Dated contracts overlap the roll: both trade on the roll date.
const OLD_CONTRACT_BARS = CL_DATES.filter((d) => d <= ROLL_DATE).map((d) => mkBar(d, OLD_C));
const NEW_CONTRACT_BARS = CL_DATES.map((d) => mkBar(d, NEW_C));

const GSPC_BARS: RegimeBar[] = dateSeq("2026-06-05", 30).map((d, i) => mkBar(d, 6000 + i));

const UNIVERSE: BullUniverseEntry[] = [
  { symbol: "CL=F", displayName: "WTI Crude", tier: "macro", assetClass: "energy",
    adapters: ["yahoo"], futures: { root: "CL", suffix: ".NYM", months: "FGHJKMNQUVXZ" } },
  { symbol: "BTC-USD", displayName: "Bitcoin", tier: "macro", assetClass: "crypto",
    adapters: ["yahoo"] },
  { symbol: "^GSPC", displayName: "S&P 500", tier: "macro", assetClass: "index",
    adapters: ["yahoo"] },
];

const registry: AdapterRegistry = {
  get: (id) => ({
    id,
    async fetchDailyBars(symbol) {
      if (symbol === "CL=F") return CL_RAW;
      if (symbol === "^GSPC") return GSPC_BARS;
      if (symbol === "BTC-USD") throw new Error("simulated Yahoo outage for BTC");
      throw new Error(`unexpected symbol ${symbol}`);
    },
  }),
};

async function fetchContract(symbol: string): Promise<RegimeBar[]> {
  // Candidates are generated from the recent-window start (~2026-06-19):
  // CLN26 (Jul), CLQ26 (Aug), CLU26 (Sep). N = expiring front, Q = new front.
  if (symbol.startsWith("CLN26")) return OLD_CONTRACT_BARS;
  if (symbol.startsWith("CLQ26")) return NEW_CONTRACT_BARS;
  throw new Error(`no data for ${symbol}`); // U26 not yet liquid — routine
}

/* ── fake DB: pattern-matched SQL over in-memory stores ───────── */

interface RollRow {
  symbol: string; roll_date: string; old_contract: string;
  new_contract: string; gap: number; cum_adjustment: number;
}

class FakeDb implements Queryable {
  bars = new Map<string, Map<string, RegimeBar>>(); // `${symbol}|${series}` → date → bar
  rolls: RollRow[] = [];
  snapshots: unknown[][] = [];
  transitions: unknown[][] = [];
  health: unknown[][] = [];

  private key(symbol: string, series: string): string { return `${symbol}|${series}`; }

  async query(text: string, params: unknown[] = []): Promise<QueryResultLike> {
    if (text.includes("select max(date) as d from market_bars")) {
      const m = this.bars.get(this.key(String(params[0]), String(params[1])));
      const dates = m ? [...m.keys()].sort() : [];
      return { rows: [{ d: dates[dates.length - 1] ?? null }] };
    }
    if (text.startsWith("insert into market_bars")) {
      for (let i = 0; i < params.length; i += 7) {
        const [symbol, series, date, open, high, low, close] =
          params.slice(i, i + 7) as [string, string, string, number, number, number, number];
        const k = this.key(symbol, series);
        if (!this.bars.has(k)) this.bars.set(k, new Map());
        this.bars.get(k)!.set(date, { date, open, high, low, close });
      }
      return { rows: [], rowCount: params.length / 7 };
    }
    if (text.includes("select date, open, high, low, close from market_bars")) {
      const m = this.bars.get(this.key(String(params[0]), String(params[1]))) ?? new Map();
      const rows = [...m.values()]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((b) => ({ ...b }));
      return { rows };
    }
    if (text.startsWith("update market_bars")) {
      const [symbol, rollDate, gap] = [String(params[0]), String(params[1]), Number(params[2])];
      const m = this.bars.get(this.key(symbol, "adj"));
      let n = 0;
      if (m) for (const [date, b] of m) {
        if (date < rollDate) {
          m.set(date, { ...b, open: b.open + gap, high: b.high + gap,
            low: b.low + gap, close: b.close + gap });
          n++;
        }
      }
      return { rows: [], rowCount: n };
    }
    if (text.startsWith("insert into futures_rolls")) {
      const [symbol, roll_date, old_contract, new_contract, gap, cum_adjustment] =
        params as [string, string, string, string, number, number];
      if (!this.rolls.some((r) => r.symbol === symbol && r.roll_date === roll_date)) {
        this.rolls.push({ symbol, roll_date, old_contract, new_contract, gap, cum_adjustment });
      }
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("from futures_rolls")) {
      const rows = this.rolls
        .filter((r) => r.symbol === String(params[0]))
        .sort((a, b) => (a.roll_date < b.roll_date ? -1 : 1)) as unknown as Record<string, unknown>[];
      return { rows };
    }
    if (text.includes("select symbol, verdict from bull_snapshots")) {
      return { rows: [] }; // no previous run in these tests
    }
    if (text.startsWith("insert into bull_snapshots")) {
      this.snapshots.push(params);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("insert into bull_transitions")) {
      this.transitions.push(params);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("insert into bull_source_health")) {
      this.health.push(params);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`FakeDb: unhandled SQL: ${text.slice(0, 80)}`);
  }
}

/* ── the tests ────────────────────────────────────────────────── */

test("full roll cycle through the pipeline, with per-symbol isolation", async () => {
  const db = new FakeDb();
  const report = await runBullScan(db, {
    universe: UNIVERSE, registry, fetchContract,
    now: () => new Date(`${RUN_DATE}T06:20:00Z`),
  });

  // Isolation: BTC failed, the other two scanned.
  assert.deepEqual(report.failed, ["BTC-USD"]);
  assert.equal(report.scanned, 2);

  // Strategy lenses: one snapshot row per symbol PER STRATEGY, all
  // derived from the same bars fetch (2 symbols × 3 lenses).
  assert.equal(db.snapshots.length, 6);
  assert.equal(report.written, 6);
  assert.deepEqual(report.writtenByStrategy, { "ml-dw": 2, "ml-weekly": 2, "ml-daily": 2 });
  const strategiesWritten = new Set(db.snapshots.map((p) => p[31])); // $32 = strategy
  assert.deepEqual([...strategiesWritten].sort(), ["ml-daily", "ml-dw", "ml-weekly"]);

  // Roll detected + audited.
  assert.equal(report.rolls.length, 1);
  const roll = report.rolls[0];
  assert.equal(roll.rollDate, ROLL_DATE);
  assert.match(roll.oldContract, /^CLN26/);
  assert.match(roll.newContract, /^CLQ26/);
  assert.ok(Math.abs(roll.gap - 1) < 1e-9);
  assert.equal(db.rolls.length, 1);
  assert.deepEqual(report.rollProbeFailures, []);

  // Storage: raw untouched, adj shifted before the roll, present equal.
  const raw = db.bars.get("CL=F|raw")!;
  const adj = db.bars.get("CL=F|adj")!;
  assert.equal(raw.get("2026-06-10")!.close, OLD_C);
  assert.equal(adj.get("2026-06-10")!.close, OLD_C + 1);       // shifted
  assert.equal(adj.get(ROLL_DATE)!.close, NEW_C);              // roll day: new level
  assert.equal(adj.get("2026-07-04")!.close, raw.get("2026-07-04")!.close); // present = real

  // Health log: one row per symbol, BTC marked failed.
  assert.equal(db.health.length, 3);
  const btcHealth = db.health.find((h) => h[1] === "BTC-USD")!;
  assert.equal(btcHealth[4], false); // ok column
});

test("re-running the same day is idempotent — no double shift, no duplicate roll", async () => {
  const db = new FakeDb();
  const opts = {
    universe: UNIVERSE, registry, fetchContract,
    now: () => new Date(`${RUN_DATE}T06:20:00Z`),
  };
  await runBullScan(db, opts);
  const report2 = await runBullScan(db, opts);

  assert.equal(report2.rolls.length, 0, "second run must not re-detect the logged roll");
  assert.equal(db.rolls.length, 1);
  const adj = db.bars.get("CL=F|adj")!;
  assert.equal(adj.get("2026-06-10")!.close, OLD_C + 1, "shift applied exactly once");
});
