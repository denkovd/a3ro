import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveLatestQuote, resolveDailyClose, DescriptorLookup } from "../src/ingest/resolve";
import type { PriceRecord, SourceDescriptor } from "../src/core/types";

/* ── fixed clock: Sunday 2026-07-05T12:00:00Z (the weekend the bug shows up) ── */
const NOW = new Date("2026-07-05T12:00:00Z");

/* ── stub descriptor lookup ──────────────────────────────────────
   yf   : live source — priority 3, cadence 60s, no publication lag
   eia  : settlement source — priority 1, daily cadence, 4 business-day lag
   (priority numbers mirror the "lower wins" convention: 1 = most trusted) */
const DESCRIPTORS: Record<string, Pick<SourceDescriptor, "priority" | "expectedCadenceMs" | "publicationLagBusinessDays">> = {
  yf: { priority: 3, expectedCadenceMs: 60_000, publicationLagBusinessDays: 0 },
  eia: { priority: 1, expectedCadenceMs: 86_400_000, publicationLagBusinessDays: 4 },
};

const lookup: DescriptorLookup = (sourceId) =>
  DESCRIPTORS[sourceId] ?? { priority: 99, expectedCadenceMs: 86_400_000, publicationLagBusinessDays: 4 };

/* ── record builders ─────────────────────────────────────────────
   Only the fields resolveLatestQuote/resolveDailyClose actually
   read are meaningful; the rest are filled with plausible filler
   so the objects satisfy PriceRecord. */
function liveRecord(opts: {
  price: number;
  observedAt: string;
  source?: string;
  benchmark?: "WTI" | "BRENT";
  kind?: "live" | "delayed";
}): PriceRecord {
  return {
    benchmark: opts.benchmark ?? "WTI",
    price: opts.price,
    unit: "USD/bbl",
    currency: "USD",
    observedAt: opts.observedAt,
    kind: opts.kind ?? "live",
    source: opts.source ?? "yf",
    confidence: "aggregator",
    fetchedAt: opts.observedAt,
    raw: { price: opts.price, unit: "USD/bbl", currency: "USD" },
  };
}

function settlementRecord(opts: {
  price: number;
  observedAt: string; // market-close instant of periodDate
  periodDate: string;
  source?: string;
  benchmark?: "WTI" | "BRENT";
}): PriceRecord {
  return {
    benchmark: opts.benchmark ?? "WTI",
    price: opts.price,
    unit: "USD/bbl",
    currency: "USD",
    observedAt: opts.observedAt,
    periodDate: opts.periodDate,
    kind: "settlement",
    source: opts.source ?? "eia",
    confidence: "official",
    fetchedAt: opts.observedAt,
    raw: { price: opts.price, unit: "USD/bbl", currency: "USD" },
  };
}

describe("resolveLatestQuote", () => {
  test("1. fresh live quote + older settlement → live wins, staleness fresh (current behavior preserved)", () => {
    const live = liveRecord({ price: 68.5, observedAt: "2026-07-05T11:59:00Z" }); // 1 min old, cadence 60s → fresh
    const settlement = settlementRecord({
      price: 71.87,
      observedAt: "2026-06-29T18:30:00Z",
      periodDate: "2026-06-29",
    });
    const q = resolveLatestQuote("WTI", [live, settlement], lookup, 71.87, NOW);
    assert.ok(q);
    assert.equal(q.kind, "live");
    assert.equal(q.price, 68.5);
    assert.equal(q.staleness, "fresh");
  });

  test("2. dead live quote (Thu) + fresh-by-lag settlement with OLDER observedAt (Jun 29) → live wins, staleness dead — the weekend case", () => {
    // Live quote observed Thu 2026-07-02T20:00Z: age vs NOW (Sun 12:00Z) is
    // ~2.67 days. yf cadence 60s widened ×3 on a weekend now = 180s tiers:
    // fresh<=180s, aging<=360s, stale<=900s → anything past that is dead.
    const live = liveRecord({ price: 68.5, observedAt: "2026-07-02T20:00:00Z" });
    // EIA settlement for Jun 29, 4-business-day lag allowed. Business days
    // between 2026-06-29 (Mon) and 2026-07-05 (Sun) = Tue,Wed,Thu,Fri = 4 → fresh.
    const settlement = settlementRecord({
      price: 71.87,
      observedAt: "2026-06-29T18:30:00Z",
      periodDate: "2026-06-29",
    });
    const q = resolveLatestQuote("WTI", [live, settlement], lookup, 71.87, NOW);
    assert.ok(q);
    assert.equal(q.kind, "live");
    assert.equal(q.price, 68.5);
    assert.equal(q.staleness, "dead");
  });

  test("3. same as 2 but settlement observedAt NEWER than the live quote (Fri settlement, stale live from Wed) → settlement wins (usable + newer)", () => {
    // Live quote from Wed 2026-07-01, ages to "stale" or "dead" by Sunday.
    const live = liveRecord({ price: 67.0, observedAt: "2026-07-01T14:00:00Z" });
    // Settlement for Fri 2026-07-03 (market close), newer observedAt than the live quote.
    const settlement = settlementRecord({
      price: 69.2,
      observedAt: "2026-07-03T18:30:00Z",
      periodDate: "2026-07-03",
    });
    const q = resolveLatestQuote("WTI", [live, settlement], lookup, 69.2, NOW);
    assert.ok(q);
    assert.equal(q.kind, "settlement");
    assert.equal(q.price, 69.2);
    assert.ok(q.staleness === "fresh" || q.staleness === "aging" || q.staleness === "stale");
  });

  test("4. only a dead live quote → returned with staleness dead (better than null for a ticker)", () => {
    const live = liveRecord({ price: 68.5, observedAt: "2026-07-02T20:00:00Z" });
    const q = resolveLatestQuote("WTI", [live], lookup, null, NOW);
    assert.ok(q);
    assert.equal(q.kind, "live");
    assert.equal(q.price, 68.5);
    assert.equal(q.staleness, "dead");
  });

  test("5. only settlements → settlement returned (unchanged path)", () => {
    const settlement = settlementRecord({
      price: 71.87,
      observedAt: "2026-06-29T18:30:00Z",
      periodDate: "2026-06-29",
    });
    const q = resolveLatestQuote("WTI", [settlement], lookup, null, NOW);
    assert.ok(q);
    assert.equal(q.kind, "settlement");
    assert.equal(q.price, 71.87);
  });

  test("6. no records → null", () => {
    const q = resolveLatestQuote("WTI", [], lookup, null, NOW);
    assert.equal(q, null);
  });

  test("7. suspect: returned live quote deviating >10% from referenceSettlement → suspect true; within → false", () => {
    const liveSuspect = liveRecord({ price: 68.5, observedAt: "2026-07-05T11:59:00Z" });
    const qSuspect = resolveLatestQuote("WTI", [liveSuspect], lookup, 100, NOW); // |68.5-100|/100 = 31.5% > 10%
    assert.ok(qSuspect);
    assert.equal(qSuspect.suspect, true);

    const liveOk = liveRecord({ price: 68.5, observedAt: "2026-07-05T11:59:00Z" });
    const qOk = resolveLatestQuote("WTI", [liveOk], lookup, 70, NOW); // |68.5-70|/70 ≈ 2.1% < 10%
    assert.ok(qOk);
    assert.equal(qOk.suspect, false);
  });

  test("7b. suspect is NOT flagged when the reference settlement is stale/dead", () => {
    // Big deviation (live 100 vs ref 70 ≈ 43%) that WOULD flag — but the
    // reference close is itself stale/dead, so it must not be called suspect.
    // This is the lagging-Brent-settlement false positive.
    const bigDev = liveRecord({ price: 100, observedAt: "2026-07-05T11:59:00Z" });
    assert.equal(resolveLatestQuote("WTI", [bigDev], lookup, 70, NOW, "stale")?.suspect, false);
    assert.equal(resolveLatestQuote("WTI", [bigDev], lookup, 70, NOW, "dead")?.suspect, false);
    // A current (fresh/aging) reference still catches the anomaly.
    assert.equal(resolveLatestQuote("WTI", [bigDev], lookup, 70, NOW, "fresh")?.suspect, true);
    assert.equal(resolveLatestQuote("WTI", [bigDev], lookup, 70, NOW, "aging")?.suspect, true);
  });

  test("8. wrong-benchmark records are ignored", () => {
    const wtiLive = liveRecord({ price: 68.5, observedAt: "2026-07-05T11:59:00Z", benchmark: "WTI" });
    const brentLive = liveRecord({ price: 72.1, observedAt: "2026-07-05T11:59:00Z", benchmark: "BRENT" });
    const q = resolveLatestQuote("WTI", [wtiLive, brentLive], lookup, null, NOW);
    assert.ok(q);
    assert.equal(q.benchmark, "WTI");
    assert.equal(q.price, 68.5);

    const qBrent = resolveLatestQuote("BRENT", [wtiLive, brentLive], lookup, null, NOW);
    assert.ok(qBrent);
    assert.equal(qBrent.benchmark, "BRENT");
    assert.equal(qBrent.price, 72.1);
  });

  test("9. delayed-kind newest market print also honored (not just live)", () => {
    // Delayed quote is the newest market print but past its usable window;
    // an older settlement is the only usable record.
    const delayed = liveRecord({
      price: 68.5,
      observedAt: "2026-07-02T20:00:00Z",
      source: "yf",
      kind: "delayed",
    });
    const settlement = settlementRecord({
      price: 71.87,
      observedAt: "2026-06-29T18:30:00Z",
      periodDate: "2026-06-29",
    });
    const q = resolveLatestQuote("WTI", [delayed, settlement], lookup, 71.87, NOW);
    assert.ok(q);
    assert.equal(q.kind, "delayed");
    assert.equal(q.price, 68.5);
    assert.equal(q.staleness, "dead");
  });
});

describe("resolveDailyClose (untouched — export surface lock-in)", () => {
  test("single settlement → picked", () => {
    const settlement = settlementRecord({
      price: 71.87,
      observedAt: "2026-06-29T18:30:00Z",
      periodDate: "2026-06-29",
    });
    const daily = resolveDailyClose("WTI", "2026-06-29", [settlement], lookup);
    assert.ok(daily);
    assert.equal(daily.price, 71.87);
    assert.equal(daily.source, "eia");
    assert.equal(daily.disagreement, false);
    assert.equal(daily.spreadPct, null);
  });
});
