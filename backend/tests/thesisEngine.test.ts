/* ────────────────────────────────────────────────────────────────
   Thesis pressure-test engine — pure-function tests. Fixture market
   contexts (no IO): a supportive tape and a hostile tape, so the
   cross-check machinery is exercised in both directions.
──────────────────────────────────────────────────────────────── */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeThesis,
  classifyKinds,
  parseThesis,
  readLanguage,
  splitSentences,
  FAKE_EVIDENCE_MAX,
  FAKE_STATED_MIN,
} from "../src/thesis/engine";
import { MarketContext } from "../src/thesis/types";

/* ── fixtures ─────────────────────────────────────────────────── */

const flatSeries = (n: number, price: number): { date: string; close: number }[] =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    close: price + Math.sin(i / 3) * price * 0.01, // ±1% wiggle → nonzero σ
  }));

const CTX_SUPPORTIVE: MarketContext = {
  asOf: "2026-07-12",
  price: { symbol: "WTI", value: 80, asOf: "2026-07-11", source: "latest_quotes/eia" },
  priceSeries: flatSeries(260, 80),
  realizedVol: { dailySigma: 0.02, windowDays: 120, observations: 120, asOf: "2026-07-11" },
  tape: { stance: "SUPPLY_TIGHT", label: "SUPPLY-TIGHT", headline: "Supply-side leads.", runDate: "2026-07-11" },
  macro: { quadrant: "REFLATION", growthMomentum: 0.8, inflationMomentum: 0.4, pressureScore: 30, diverging: false, runDate: "2026-07-11" },
  positioning: { stance: "NEUTRAL", netLength: 180_000, percentile1y: 0.5, reportDate: "2026-07-07" },
  trend: { symbol: "CL=F", verdict: "BULLISH", dailyTrend: 1, weeklyTrend: 1, runDate: "2026-07-11", source: "regime_snapshots" },
  oilAdjacent: true,
};

const CTX_HOSTILE: MarketContext = {
  ...CTX_SUPPORTIVE,
  tape: { stance: "SUPPLY_AMPLE", label: "SUPPLY-AMPLE", headline: "Supply-side loose.", runDate: "2026-07-11" },
  macro: { quadrant: "DEFLATION", growthMomentum: -1.2, inflationMomentum: -0.5, pressureScore: 72, diverging: true, runDate: "2026-07-11" },
  positioning: { stance: "CROWDED_LONG", netLength: 320_000, percentile1y: 0.93, reportDate: "2026-07-07" },
  trend: { symbol: "CL=F", verdict: "BEARISH", dailyTrend: -1, weeklyTrend: -1, runDate: "2026-07-11", source: "regime_snapshots" },
};

const CTX_EMPTY: MarketContext = {
  asOf: "2026-07-12",
  price: null,
  priceSeries: [],
  realizedVol: null,
  tape: null,
  macro: null,
  positioning: null,
  trend: null,
  oilAdjacent: true,
};

const LONG_THESIS_BODY =
  "WTI is going to $95 by September. OPEC cuts are holding and EIA inventories drew 4 Mbbl last week. " +
  "China demand is recovering. Positioning has room because funds are not crowded. The dollar can't rally with the Fed cutting.";

/* ── parsing ──────────────────────────────────────────────────── */

test("splitSentences: splits on boundaries, keeps decimals intact", () => {
  const s = splitSentences("WTI goes to $95.50 by September. OPEC cuts are holding! Demand recovers.");
  assert.equal(s.length, 3);
  assert.ok(s[0].includes("$95.50"));
});

test("parseThesis: direction long, WTI, September horizon, $95 target", () => {
  const p = parseThesis("Oil long", LONG_THESIS_BODY, "2026-07-12");
  assert.equal(p.direction, "long");
  assert.equal(p.instrument, "WTI");
  assert.equal(p.targetPrice, 95);
  assert.equal(p.horizonSource, "stated");
  // Jul 12 → Sep 30 ≈ 80 days
  assert.ok(p.horizonDays > 60 && p.horizonDays < 95, `horizon ${p.horizonDays}`);
});

test("parseThesis: overrides win over inference", () => {
  const p = parseThesis("t", LONG_THESIS_BODY, "2026-07-12", { direction: "short", instrument: "BRENT", horizonDays: 30 });
  assert.equal(p.direction, "short");
  assert.equal(p.instrument, "BRENT");
  assert.equal(p.horizonDays, 30);
  assert.equal(p.directionSource, "stated");
});

test("classifyKinds: supply sentence classified supply-first", () => {
  assert.equal(classifyKinds("OPEC cuts are holding and inventories are drawing")[0], "supply");
  assert.equal(classifyKinds("Funds are crowded short and a squeeze is coming")[0], "positioning");
});

/* ── language read / fake confidence ──────────────────────────── */

test("readLanguage: absolutes raise stated confidence, hedges lower it", () => {
  const strong = readLanguage("The dollar can't rally, this is guaranteed and everyone knows it.");
  const hedged = readLanguage("The dollar might weaken, perhaps meaningfully, if the Fed cuts.");
  assert.ok(strong.statedConfidence > hedged.statedConfidence);
  assert.ok(strong.absoluteMarkers.length >= 2);
});

test("readLanguage: numbers and named sources raise evidence", () => {
  const evidenced = readLanguage("EIA reported a 4 Mbbl draw and exports hit 4.5 mb/d.");
  const bare = readLanguage("Inventories are obviously going to keep drawing forever.");
  assert.ok(evidenced.evidenceScore > bare.evidenceScore);
});

test("fake confidence: loud claim with no evidence is flagged", () => {
  const a = analyzeThesis(
    "t",
    "Oil will definitely explode higher, guaranteed, everyone knows OPEC never lets price fall.",
    CTX_EMPTY,
  );
  const fake = a.assumptions.filter((x) => x.fakeConfidence);
  assert.ok(fake.length >= 1, "expected at least one fake-confidence flag");
  const lang = fake[0].language;
  assert.ok(lang && lang.statedConfidence >= FAKE_STATED_MIN && lang.evidenceScore <= FAKE_EVIDENCE_MAX);
});

/* ── analysis: context direction ──────────────────────────────── */

test("supportive context scores higher than hostile for the same thesis", () => {
  const sup = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_SUPPORTIVE);
  const hos = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_HOSTILE);
  assert.ok(
    sup.strength > hos.strength,
    `supportive ${sup.strength} should beat hostile ${hos.strength}`,
  );
  // hostile context must produce live contradictions
  const contra = hos.assumptions.reduce((n, a) => n + a.checks.filter((c) => c.verdict === "contradicts").length, 0);
  assert.ok(contra >= 2, `expected ≥2 contradictions, got ${contra}`);
});

test("assumptions are sorted weakest-first (fragility desc)", () => {
  const a = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_HOSTILE);
  for (let i = 1; i < a.assumptions.length; i++) {
    assert.ok(a.assumptions[i - 1].fragility >= a.assumptions[i].fragility);
  }
});

test("implied assumptions exist and are labeled", () => {
  const a = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_SUPPORTIVE);
  const implied = a.assumptions.filter((x) => x.origin === "implied");
  assert.ok(implied.length >= 2, `expected ≥2 implied, got ${implied.length}`);
  // vol-plausibility must exist (target + horizon + σ all present)
  assert.ok(implied.some((x) => x.reasons.some((r) => r.includes("σ-multiple"))));
});

test("strength components sum to the reported strength (transparent math)", () => {
  const a = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_HOSTILE);
  const sum = 50 + a.strengthComponents.reduce((s, c) => s + c.effect, 0);
  const clamped = Math.max(2, Math.min(98, Math.round(sum)));
  assert.equal(a.strength, clamped);
});

test("empty context: checks read no_data, never invented", () => {
  const a = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_EMPTY);
  for (const asm of a.assumptions) {
    for (const c of asm.checks) {
      assert.ok(["no_data", "neutral", "supports", "contradicts"].includes(c.verdict));
    }
  }
  const liveChecks = a.assumptions.flatMap((x) => x.checks).filter((c) => c.verdict === "supports" || c.verdict === "contradicts");
  assert.equal(liveChecks.length, 0, "no live verdicts without live data");
  assert.ok(a.contextCoverage.every((c) => !c.live || c.source === "tape"));
});

test("every assumption carries counter-case and kill evidence", () => {
  const a = analyzeThesis("Long oil", LONG_THESIS_BODY, CTX_SUPPORTIVE);
  for (const asm of a.assumptions) {
    assert.ok(asm.counterCase.length > 40, `counter-case too thin for ${asm.id}`);
    assert.ok(asm.killEvidence.length >= 1, `no kill evidence for ${asm.id}`);
    assert.ok(asm.reasons.length >= 1, `no reasons for ${asm.id}`);
  }
});
