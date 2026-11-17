import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadUtility(name) {
  const path = ["refineries", "companies", "assetGraph"].includes(name) ? `../lib/oil/${name}.ts` : `../app/components/projects/oil/${name}.ts`;
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { metricFreshness, currentMetrics, quoteStatus, crackSpread, comparablePriorClose } = await loadUtility("dataQuality");
const { REFINERIES, refineryStatus, refineryCondition } = await loadUtility("refineries");
const { COMPANIES, ASSET_RELATIONS, COMPANY_RELATIONS, SUPPLY_RELATIONS } = await loadUtility("companies");
const graphLib = await loadUtility("assetGraph");
const now = Date.parse("2026-10-10T12:00:00Z");
const metric = (name, periodDate, value = 90) => ({ metric: name, periodDate, value, corridor: "usgulf", unit: "%", source: "eia", updatedAt: "2026-10-10T12:00:00Z" });

test("front-month futures are not presented as changes against physical spot closes", () => {
  assert.equal(comparablePriorClose({ source: "yfinance" }, { source: "eia" }), false);
  assert.equal(comparablePriorClose({ source: "yfinance" }, { source: "fred" }), false);
  assert.equal(comparablePriorClose({ source: "eia" }, { source: "fred" }), true);
});

test("refreshing July observations does not make them current", () => {
  const row = metric("refinery_utilization", "2026-07-17");
  assert.equal(metricFreshness(row, now), "stale");
  assert.deepEqual(currentMetrics([row], now), []);
});

test("freshness follows source cadence and rejects invalid/future periods", () => {
  assert.equal(metricFreshness(metric("refinery_utilization", "2026-10-02"), now), "current");
  assert.equal(metricFreshness(metric("gasoline_spot", "2026-10-02"), now), "stale");
  assert.equal(metricFreshness(metric("bunker_sales", "2026-09-01"), now), "current");
  assert.equal(metricFreshness(metric("tanker_transits_7d", "2026-12-01"), now), "stale");
  assert.equal(metricFreshness(metric("tanker_transits_7d", "invalid"), now), "stale");
});

test("missing and non-finite readings cannot become current signals", () => {
  assert.deepEqual(currentMetrics(null, now), []);
  assert.deepEqual(currentMetrics([metric("refinery_utilization", "2026-10-09", NaN)], now), []);
});

test("prices preserve delayed, settlement and stale semantics", () => {
  const quote = { kind: "delayed", observedAt: "2026-10-10T11:50:00Z", staleness: "fresh" };
  assert.equal(quoteStatus(quote, now), "Delayed");
  assert.equal(quoteStatus({ ...quote, kind: "settlement" }, now), "Settlement");
  assert.equal(quoteStatus({ ...quote, kind: "live", observedAt: "2026-10-10T10:00:00Z" }, now), "Last trade");
  assert.equal(quoteStatus({ ...quote, observedAt: "2026-07-29T06:00:00Z" }, now), "Stale");
  assert.equal(quoteStatus({ ...quote, staleness: "dead" }, now), "Last trade");
  assert.equal(quoteStatus(undefined, now), "Unavailable");
});

test("margin proxy requires matched source dates and providers", () => {
  const rows = [metric("gasoline_spot", "2026-10-09", 110), metric("heating_oil_spot", "2026-10-09", 140), metric("wti_spot", "2026-10-09", 80)];
  assert.equal(crackSpread(rows, now).value, 40);
  assert.equal(crackSpread([rows[0], { ...rows[1], periodDate: "2026-10-08" }, rows[2]], now), null);
  assert.equal(crackSpread([rows[0], { ...rows[1], source: "other" }, rows[2]], now), null);
  assert.equal(crackSpread(rows.map(row => ({ ...row, periodDate: "2026-07-17" })), now), null);
  assert.equal(crackSpread(rows.slice(0, 2), now), null);
});

test("operator capacity references cannot imply operating status or an outage", () => {
  assert.equal(new Set(REFINERIES.map(r => r.id)).size, REFINERIES.length);
  for (const r of REFINERIES) {
    assert.ok(r.sourceUrl.startsWith("https://"));
    assert.ok(r.reviewedAt);
    assert.ok(r.lon >= -180 && r.lon <= 180 && r.lat >= -90 && r.lat <= 90);
    if (r.events.length === 0) assert.equal(refineryStatus(r), "Operating status unverified");
  }
  assert.equal(refineryStatus(REFINERIES.find(r => r.id === "grangemouth")), "Refining ceased");
  assert.equal(refineryStatus({ events: [{ date: "2025-04", kind: "closure" }, { date: "2026-09", kind: "restart" }] }), "Operating status unverified");
});

const graph = { refineries: REFINERIES, companies: COMPANIES, assetRelations: ASSET_RELATIONS, companyRelations: COMPANY_RELATIONS, supplyRelations: SUPPLY_RELATIONS };
const sourced = { sourceUrl: "https://example.com/source", reviewedAt: "2026-11-16", confidence: "operator", basis: "Operator-published statement." };

test("every stored relationship is sourced, dated, typed and resolves", () => {
  assert.deepEqual(graphLib.validateGraph(graph), []);
});

test("validation rejects unsourced, undated or mixed-type relationships", () => {
  const base = { ...graph, assetRelations: [...ASSET_RELATIONS] };
  const bad = (patch) => graphLib.validateGraph({ ...base, ...patch }).map(i => i.problem);
  assert.ok(bad({ assetRelations: [...ASSET_RELATIONS, { ...ASSET_RELATIONS[0], id: "x1", sourceUrl: "" }] }).includes("source must be an https URL"));
  assert.ok(bad({ assetRelations: [...ASSET_RELATIONS, { ...ASSET_RELATIONS[0], id: "x2", reviewedAt: "" }] }).includes("review date must be YYYY-MM-DD"));
  assert.ok(bad({ assetRelations: [...ASSET_RELATIONS, { ...ASSET_RELATIONS[0], id: "x3", role: "operates", stakePct: 50 }] }).includes("operation carries no ownership stake"));
  assert.ok(bad({ assetRelations: [...ASSET_RELATIONS, { ...ASSET_RELATIONS[0], id: "x4", role: "supplies" }] }).includes("asset role must be operates or owns"));
  assert.ok(bad({ companyRelations: [...COMPANY_RELATIONS, { ...sourced, id: "x5", parentId: "aramco", childId: "yasref", role: "owns", stakePct: 10, asOf: null }] }).includes("a stake needs the date it describes"));
  assert.ok(bad({ companyRelations: [...COMPANY_RELATIONS, { ...sourced, id: "x6", parentId: "eni", childId: "yasref", role: "owns", stakePct: 10, asOf: "2026" }] }).some(p => p.startsWith("recorded stakes total")));
  assert.ok(bad({ companyRelations: [...COMPANY_RELATIONS, { ...sourced, id: "x7", parentId: "aramco", childId: "sinopec", role: "group", stakePct: 5, asOf: "2026" }] }).includes("group affiliation carries no stake"));
  assert.ok(bad({ assetRelations: ASSET_RELATIONS.filter(r => r.assetId !== "jamnagar") }).includes("no current documented operator"));
});

test("no supply relationship is invented", () => {
  assert.deepEqual(SUPPLY_RELATIONS, []);
  for (const r of REFINERIES) assert.deepEqual(graphLib.assetRelationsFor(graph, r.id).supply, []);
});

test("operation, ownership and former roles stay distinct", () => {
  const now = Date.parse("2026-11-16T00:00:00Z");
  const zour = graphLib.assetRelationsFor(graph, "al-zour", now);
  assert.deepEqual(zour.operators.map(r => r.companyId), ["knpc"]);
  assert.deepEqual(zour.former.map(r => r.companyId), ["kipic"]);
  const jamnagar = graphLib.assetRelationsFor(graph, "jamnagar", now);
  assert.equal(jamnagar.operators.length, 1);
  assert.deepEqual(jamnagar.owners, [], "an operator profile alone is not recorded as ownership");
  const beforeMerger = graphLib.assetRelationsFor(graph, "al-zour", Date.parse("2026-01-01"));
  assert.ok(beforeMerger.operators.some(r => r.companyId === "kipic"));
});

test("ownership chains walk documented parents only and keep stated stakes", () => {
  const chain = graphLib.ownershipChain(graph, "bapco-refining");
  assert.deepEqual(chain.map(l => [l.relation.parentId, l.relation.stakePct, l.depth]), [["bapco-energies", 100, 1], ["gov-bahrain", 100, 2]]);
  const yasref = graphLib.ownershipChain(graph, "yasref").map(l => l.relation.stakePct).sort();
  assert.deepEqual(yasref, [37.5, 62.5]);
  const cyclic = { ...graph, companyRelations: [...COMPANY_RELATIONS, { ...sourced, id: "loop", parentId: "gov-bahrain", childId: "bapco-refining", role: "owns", stakePct: null, asOf: null }] };
  assert.ok(graphLib.ownershipChain(cyclic, "bapco-refining").length < 10);
});

test("company assets include holdings through subsidiaries but never inherit operation", () => {
  const vitol = graphLib.companyAssets(graph, "vitol");
  assert.deepEqual(vitol.map(a => a.refinery.id), []);
  const kpc = graphLib.companyAssets(graph, "kpc", Date.parse("2026-11-16"));
  assert.deepEqual(kpc.map(a => a.refinery.id), ["al-zour"], "KPC reaches Al-Zour only through KNPC's documented ownership");
  assert.deepEqual(kpc[0].roles, ["owns"]);
  assert.deepEqual(kpc[0].via, ["knpc"]);
  const knpc = graphLib.companyAssets(graph, "knpc");
  assert.deepEqual(knpc.map(a => a.refinery.id).sort(), ["al-zour", "mina-abdullah", "mina-ahmadi"]);
  const kipic = graphLib.companyAssets(graph, "kipic", Date.parse("2026-11-16"));
  assert.ok(kipic.every(a => a.former));
});

test("proximity is computed, labelled separately and never stored", () => {
  const near = graphLib.nearbyAssets(graph, "mina-ahmadi", 400);
  assert.equal(near[0].refinery.id, "mina-abdullah");
  assert.ok(near[0].km < 10);
  assert.ok(near.some(n => n.refinery.id === "al-zour" && n.sharedCorridor === "hormuz"));
  assert.ok(graphLib.nearbyAssets(graph, "grangemouth", 400).every(n => n.km <= 400));
  assert.ok(!ASSET_RELATIONS.some(r => /near|proxim/i.test(r.role)));
});

test("filters combine facets and use the shared evidence status", () => {
  const status = r => refineryCondition(r).status;
  const all = graphLib.filterRefineries(graph, graphLib.EMPTY_FILTER, status);
  assert.equal(all.size, REFINERIES.length);
  assert.deepEqual([...graphLib.filterRefineries(graph, { ...graphLib.EMPTY_FILTER, status: "closed" }, status)].sort(), ["benicia", "grangemouth", "los-angeles-p66"]);
  assert.deepEqual([...graphLib.filterRefineries(graph, { ...graphLib.EMPTY_FILTER, country: "Kuwait", companyId: "knpc" }, status)].sort(), ["al-zour", "mina-abdullah", "mina-ahmadi"]);
  const dev = graphLib.filterRefineries(graph, { ...graphLib.EMPTY_FILTER, developments: true }, status);
  assert.ok(dev.has("yasref") && !dev.has("jamnagar"));
  assert.equal(graphLib.filterIsActive(graphLib.EMPTY_FILTER), false);
});

test("dated developments never change operating status", () => {
  for (const id of ["al-zour", "yasref", "dangote", "sarroch"]) {
    assert.equal(refineryStatus(REFINERIES.find(r => r.id === id), now), "Operating status unverified");
  }
});

test("search ranks prefixes, folds accents and covers every entity type", () => {
  const corpus = graphLib.searchCorpus(graph, { corridors: [{ id: "hormuz", title: "Strait of Hormuz" }], routes: [{ id: "gulf_east_asia", name: "GULF → EAST ASIA" }] });
  assert.equal(graphLib.searchEntities(corpus, "jam")[0].id, "jamnagar");
  assert.equal(graphLib.searchEntities(corpus, "knpc")[0].kind, "company");
  assert.ok(graphLib.searchEntities(corpus, "knpc").some(h => h.id === "mina-ahmadi"), "operator name still finds its refineries");
  assert.ok(graphLib.searchEntities(corpus, "kuwait").some(h => h.kind === "country"));
  assert.ok(graphLib.searchEntities(corpus, "HORMUZ").some(h => h.kind === "corridor"));
  assert.ok(graphLib.searchEntities(corpus, "east asia").some(h => h.kind === "route"));
  assert.ok(graphLib.searchEntities(corpus, "sarlúx").some(h => h.id === "sarlux"));
  assert.deepEqual(graphLib.searchEntities(corpus, "   "), []);
  assert.ok(!corpus.some(i => i.kind === "company" && i.id === "nope"));
});

test("fit view centres on the selection and zooms to its spread", () => {
  const kw = graphLib.fitView(REFINERIES.filter(r => r.country === "Kuwait"));
  assert.ok(Math.abs(kw.lat - 28.9) < 0.5 && Math.abs(kw.lon - 48.2) < 0.5);
  assert.ok(kw.zoom > 1.45);
  const world = graphLib.fitView(REFINERIES);
  assert.ok(world.zoom < kw.zoom);
  assert.equal(graphLib.fitView([]), null);
});

/* ── gate traffic vs norm (Commodity Watch globe, signal-first layer) ── */
const gate = await loadUtility("gateSignal");
const { flowHealthBucket } = await loadUtility("../oilTrackerShared");
const gateNow = Date.parse("2026-11-16T00:00:00Z");
const norm = (meanValue, extra = {}) => ({ meanValue, yoyPct: null, sampleTo: "2026-11-07", ...extra });
const reading = (value, periodDate = "2026-11-08") => ({ value, periodDate });
const sig = (input) => gate.gateSignal({ fresh: true, norm5y: null, now: gateNow, ...input });

test("a gate far below its norm reads below, with the 5-yr norm and drift as context only", () => {
  const s = sig({ reading: reading(1.0), norm1y: norm(13.071, { yoyPct: -73.5 }), norm5y: norm(46.277) });
  assert.equal(s.state, "below");
  assert.equal(Math.round(s.ratio * 100), 8);
  assert.equal(Math.round(s.ratio5y * 100), 2);
  assert.equal(gate.gateStatusText(s), "8% of 1-yr norm");
  assert.equal(gate.gateArrow(s), "▼");
  assert.deepEqual(gate.gateContextParts(s), ["2% of 5-yr norm (46.3/d)", "1-yr norm itself −74% YoY"]);
  // the 5-yr norm never changes the state: colour stays on the 1-yr ratio
  const typicalOn1y = sig({ reading: reading(80), norm1y: norm(76.465), norm5y: norm(400) });
  assert.equal(typicalOn1y.state, "typical");
  assert.equal(gate.gateArrow(typicalOn1y), "");
});

test("the neutral band matches the globe colour scale exactly", () => {
  const expected = { low: "below", neutral: "typical", high: "above" };
  for (const ratio of [0.05, 0.5, 0.8499, 0.85, 0.9, 1, 1.15, 1.1501, 1.5, 3]) {
    assert.equal(sig({ reading: reading(ratio * 100), norm1y: norm(100) }).state, expected[flowHealthBucket(ratio)], `ratio ${ratio}`);
  }
});

test("a stale reading is dated, never compared, coloured or ranked as typical", () => {
  const s = sig({ reading: reading(14.3, "2026-07-19"), fresh: false, norm1y: norm(13.071), norm5y: norm(46.277) });
  assert.equal(s.state, "stale");
  assert.equal(s.ratio, null);
  assert.equal(s.ratio5y, null);
  assert.equal(s.severity, 0);
  assert.equal(gate.hasComparison(s), false);
  assert.equal(gate.gateStatusText(s), "Stale reading · 2026-07-19");
});

test("a missing, expired, zero or invalid norm never yields a typical reading", () => {
  const cases = [null, norm(13, { sampleTo: "2026-09-01" }), norm(0), norm(-4), norm(NaN), norm(13, { sampleTo: "not-a-date" })];
  for (const norm1y of cases) {
    const s = sig({ reading: reading(13), norm1y });
    assert.equal(s.state, "no-norm");
    assert.equal(s.ratio, null);
    assert.equal(gate.isOutsideTypical(s), false);
    assert.equal(gate.gateStatusText(s), "No current norm on file");
  }
  // a baseline that ended exactly 45 days ago is still the norm; one day more is not
  assert.equal(sig({ reading: reading(13), norm1y: norm(13, { sampleTo: "2026-10-02" }) }).state, "typical");
  assert.equal(sig({ reading: reading(13), norm1y: norm(13, { sampleTo: "2026-10-01" }) }).state, "no-norm");
});

test("no reading is an absence of data, not zero traffic", () => {
  for (const r of [null, reading(NaN), reading(Infinity)]) {
    const s = sig({ reading: r, norm1y: norm(13) });
    assert.equal(s.state, "no-reading");
    assert.equal(s.value, null);
    assert.equal(s.ratio, null);
  }
  // a genuine zero reading is data and is compared
  assert.equal(sig({ reading: reading(0), norm1y: norm(13) }).state, "below");
});

test("gates rank by departure from the norm, then typical, then uncompared — each once", () => {
  const rows = [
    { id: "singapore", signal: sig({ reading: reading(83.6), norm1y: norm(76.465) }) },
    { id: "suez", signal: sig({ reading: reading(15.4), fresh: false, norm1y: norm(16.065) }) },
    { id: "bab_el_mandeb", signal: sig({ reading: reading(6.9), norm1y: norm(12.034) }) },
    { id: "panama", signal: sig({ reading: null, norm1y: norm(13.688) }) },
    { id: "hormuz", signal: sig({ reading: reading(1.0), norm1y: norm(13.071) }) },
    { id: "cape", signal: sig({ reading: reading(30), norm1y: norm(18.354) }) },
  ];
  const ranked = gate.rankGateSignals(rows);
  assert.deepEqual(ranked.map(r => r.id), ["hormuz", "cape", "bab_el_mandeb", "singapore", "suez", "panama"]);
  assert.equal(new Set(ranked.map(r => r.id)).size, rows.length);
  assert.deepEqual(rows.map(r => r.id)[0], "singapore", "ranking does not mutate its input");
});

test("a route only reads as flowing when every gate on it has a current reading at or above norm", () => {
  const below = sig({ reading: reading(1), norm1y: norm(13) });
  const typical = sig({ reading: reading(13), norm1y: norm(13) });
  const above = sig({ reading: reading(20), norm1y: norm(13) });
  const stale = sig({ reading: reading(13), fresh: false, norm1y: norm(13) });
  const noNorm = sig({ reading: reading(13), norm1y: null });
  assert.equal(gate.routeFlowState([typical, above]), "flowing");
  assert.equal(gate.routeFlowState([below, typical]), "interrupted");
  assert.equal(gate.routeFlowState([typical, below, above]), "interrupted");
  assert.equal(gate.routeFlowState([below, stale]), "interrupted");
  assert.equal(gate.routeFlowState([]), "unobserved");
  assert.equal(gate.routeFlowState([typical, stale]), "unobserved");
  assert.equal(gate.routeFlowState([noNorm]), "unobserved");
  assert.equal(gate.routeFlowState([undefined]), "unobserved");
  assert.equal(gate.routeWorstRatio([typical, below]), below.ratio);
  assert.equal(gate.routeWorstRatio([stale, undefined]), null);
});

test("the globe wires the signal layer: legend mounted, reference layers quiet, every gate listed once", async () => {
  const read = (p) => readFile(new URL(`../app/components/projects/${p}`, import.meta.url), "utf8");
  const [core, types, rail, routes] = await Promise.all([read("OilTrackerCore.tsx"), read("oil/types.ts"), read("oil/IntelRail.tsx"), read("flowRoutes.ts")]);
  assert.ok(/<FlowHealthLegend\b/.test(core), "the map key is rendered on the globe");
  assert.equal((core.match(/producers: "off", \/\/ static annual reference/g) ?? []).length, 2, "producer references start switched off");
  assert.ok(core.includes('if (flow === "flowing" && !reducedRef.current'), "only flowing routes pulse");
  const ids = [...types.matchAll(/\{ id: "(\w+)", title: "[^"]+", focus:/g)].map(m => m[1]);
  assert.deepEqual([...ids].sort(), ["bab_el_mandeb", "cape", "hormuz", "panama", "singapore", "suez"]);
  assert.ok(rail.indexOf("<GateSignals") > 0 && rail.indexOf("<GateSignals") < rail.indexOf("<PhysicalOverview"), "signals lead the overview");
  // every route that starts at the Hormuz hotspot is governed by the Hormuz gate
  for (const block of routes.split(/\n  \{\n/).slice(1)) {
    if (/pts: \[\s*\[56\.5, 26\.6\]/.test(block)) assert.ok(/gates: \[[^\]]*"hormuz"/.test(block), block.match(/id: "(\w+)"/)?.[1]);
  }
});
