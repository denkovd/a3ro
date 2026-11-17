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

test("a gate far below its norm reads below; a drifted 1-yr norm hands over to the 5-yr norm", () => {
  // Hormuz as stored on 17 Nov 2026: the 1-yr mean (13.1) is 72% under the 5-yr mean (46.3)
  const s = sig({ reading: reading(1.0), norm1y: norm(13.071, { yoyPct: -73.5 }), norm5y: norm(46.277) });
  assert.equal(s.state, "below");
  assert.equal(s.ref, "5y");
  assert.equal(s.switched, true);
  assert.equal(Math.round(s.ratio * 100), 2);
  assert.equal(Math.round(s.ratio1y * 100), 8);
  assert.equal(Math.round(s.ratio5y * 100), 2);
  assert.equal(gate.gateStatusText(s), "2% of 5-yr norm");
  assert.equal(gate.gateArrow(s), "▼");
  assert.deepEqual(gate.gateContextParts(s), ["8% of 1-yr norm (13.1/d)", "5-yr norm used: 1-yr norm is 72% below it"]);
  // a 1-yr norm that agrees with the 5-yr norm stays the reference, and the 5-yr norm is context only
  const steady = sig({ reading: reading(83.6), norm1y: norm(76.465, { yoyPct: -6.5 }), norm5y: norm(81.365) });
  assert.equal(steady.ref, "1y");
  assert.equal(steady.switched, false);
  assert.equal(steady.state, "typical");
  assert.equal(gate.gateStatusText(steady), "109% of 1-yr norm");
  assert.deepEqual(gate.gateContextParts(steady), ["103% of 5-yr norm (81.4/d)"]);
  assert.equal(gate.gateArrow(steady), "");
  // with only a 1-yr norm on file nothing changes from before: drift is still called out
  const only1y = sig({ reading: reading(1.0), norm1y: norm(13.071, { yoyPct: -73.5 }) });
  assert.equal(gate.gateStatusText(only1y), "8% of 1-yr norm");
  assert.deepEqual(gate.gateContextParts(only1y), ["1-yr norm itself −74% YoY"]);
});

test("without a weekly spread the fixed band matches the globe colour scale exactly", () => {
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

/* ── severity tiers, mark size and the week-on-week change layer ── */
const hist = await loadUtility("gateHistory");
const daysEnding = (end, values) => values.map((value, i) => ({ date: new Date(Date.parse(`${end}T00:00:00Z`) - (values.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), value }));
// last 14 reported days per gate, as stored on 17 Nov 2026 (week to 8 Nov and the week before)
const SG_14 = [76, 71, 69, 68, 62, 73, 76, 100, 84, 84, 75, 82, 81, 79];
const BAB_14 = [15, 2, 5, 7, 4, 13, 14, 8, 9, 9, 5, 8, 3, 6];
const HORMUZ_14 = [2, 0, 2, 1, 0, 4, 1, 1, 1, 2, 0, 1, 1, 1];

test("tiers and mark size follow the percent departure from the norm, on both sides", () => {
  const at = (ratio) => sig({ reading: reading(ratio * 100), norm1y: norm(100) });
  assert.deepEqual([1, 0.84, 0.61, 0.6, 0.31, 0.3, 0.05].map(r => gate.gateTier(at(r))), [0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([1.16, 1.39, 1.4, 1.7, 2.5].map(r => gate.gateTier(at(r))), [1, 1, 2, 3, 3]);
  assert.deepEqual([0.8, 0.5, 0.2].map(r => gate.gateTierText(at(r))), ["Below", "Well below", "Severe"]);
  assert.deepEqual([1.2, 1.5, 2].map(r => gate.gateTierText(at(r))), ["Above", "Well above", "Far above"]);
  assert.equal(gate.gateTierText(at(1)), "Within typical range");
  // radius: 6px plus 20px per 100% departure, capped; a soft week and a closed strait are far apart
  assert.equal(gate.gateMarkRadius(at(0.8)), 10);
  assert.equal(Math.round(gate.gateMarkRadius(sig({ reading: reading(6.9), norm1y: norm(12.034) }))), 15);
  assert.equal(Math.round(gate.gateMarkRadius(sig({ reading: reading(1.0), norm1y: norm(13.071) }))), 24);
  assert.equal(gate.gateMarkRadius(at(0)), 26);
  assert.equal(gate.gateMarkRadius(at(3)), 26, "above-norm marks scale the same way and cap");
  const radii = [0.84, 0.7, 0.5, 0.3, 0.1].map(r => gate.gateMarkRadius(at(r)));
  assert.deepEqual(radii, [...radii].sort((a, b) => a - b), "radius grows as the shortfall grows");
  // no comparison never takes a severity size
  assert.equal(gate.gateMarkRadius(at(1)), 5.5);
  assert.equal(gate.gateMarkRadius(sig({ reading: reading(1), fresh: false, norm1y: norm(100) })), 5);
  assert.equal(gate.gateMarkRadius(undefined), 5);
});

test("the absolute gap is stated against the 1-yr norm and only when there is a comparison", () => {
  const hormuz = sig({ reading: reading(1.0), norm1y: norm(13.071) });
  assert.equal(gate.gateShortfallText(hormuz), "about 12 fewer tankers a day");
  assert.equal(gate.gateShortfallShort(hormuz), "≈12 FEWER/D");
  assert.equal(gate.gateShortfallText(sig({ reading: reading(6.9), norm1y: norm(12.034) })), "about 5.1 fewer tankers a day");
  assert.equal(gate.gateShortfallText(sig({ reading: reading(30), norm1y: norm(18.354) })), "about 12 more tankers a day");
  assert.equal(gate.gateShortfallText(sig({ reading: reading(1), fresh: false, norm1y: norm(13) })), "");
  assert.equal(gate.gateShortfallShort(sig({ reading: reading(1), norm1y: null })), "");
});

test("week-on-week change uses calendar weeks and reproduces the stored 7-day readings", () => {
  const sg = hist.weeklyChange(daysEnding("2026-11-08", SG_14), "2026-11-08");
  assert.equal(sg.status, "ok");
  assert.equal(sg.current.mean.toFixed(1), "83.6");
  assert.equal(sg.prior.mean.toFixed(1), "70.7");
  assert.equal(Math.round(sg.pct), 18);
  assert.deepEqual([sg.current.from, sg.current.to, sg.prior.from, sg.prior.to], ["2026-11-02", "2026-11-08", "2026-10-26", "2026-11-01"]);
  assert.equal(hist.weeklyChangeText(sg), "+18% on last week (70.7/d)");
  assert.equal(hist.weeklyChangeShort(sg), "WK +18%");
  const bab = hist.weeklyChange(daysEnding("2026-11-08", BAB_14), "2026-11-08");
  assert.equal(bab.current.mean.toFixed(1), "6.9");
  assert.equal(Math.round(bab.pct), -20);
  assert.equal(hist.weeklyChangeShort(bab), "WK −20%");
});

test("a percent change is withheld when both weeks carry too few tankers", () => {
  const hormuz = hist.weeklyChange(daysEnding("2026-11-08", HORMUZ_14), "2026-11-08");
  assert.equal(hormuz.status, "low-counts");
  assert.equal(hormuz.pct, null);
  assert.equal(hormuz.current.mean.toFixed(1), "1.0");
  assert.equal(hist.weeklyChangeText(hormuz), "1.0/d vs 1.4/d last week · too few tankers for a % change");
  assert.equal(hist.weeklyChangeShort(hormuz), "WK 1.0 VS 1.4/D");
  // a collapse from a busy week is a real percent, even though this week is tiny
  const collapse = hist.weeklyChange(daysEnding("2026-11-08", [15, 14, 16, 13, 15, 14, 16, 1, 0, 2, 1, 1, 0, 1]), "2026-11-08");
  assert.equal(collapse.status, "ok");
  assert.equal(Math.round(collapse.pct), -94);
  // a week of zeros before cannot anchor a percent
  assert.equal(hist.weeklyChange(daysEnding("2026-11-08", [0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9]), "2026-11-08").status, "low-counts");
});

test("missing days are missing, not zero: thin weeks are not compared", () => {
  const all = daysEnding("2026-11-08", SG_14);
  // two days missing from this week: still compared, over the 5 reported days
  const five = hist.weeklyChange(all.filter(p => !["2026-11-03", "2026-11-06"].includes(p.date)), "2026-11-08");
  assert.equal(five.status, "ok");
  assert.equal(five.current.days, 5);
  assert.equal(five.current.mean, (100 + 84 + 75 + 81 + 79) / 5);
  // three missing: no comparison, and no text
  const four = hist.weeklyChange(all.filter(p => !["2026-11-03", "2026-11-05", "2026-11-06"].includes(p.date)), "2026-11-08");
  assert.equal(four.status, "insufficient");
  assert.equal(four.pct, null);
  assert.equal(hist.weeklyChangeText(four), "");
  assert.equal(hist.weeklyChangeShort(four), "");
  // no prior week on file
  assert.equal(hist.weeklyChange(all.slice(7), "2026-11-08").status, "insufficient");
  // invalid rows are dropped and duplicate days collapse
  assert.equal(hist.cleanDaily([{ date: "2026-11-01", value: NaN }, { date: "bad", value: 3 }, { date: "2026-11-02", value: 4 }, { date: "2026-11-02T00:00:00Z", value: 5 }]).length, 1);
});

test("holes in the series are reported as gaps and never bridged by a line", () => {
  const early = daysEnding("2026-07-19", [14, 15, 16, 15, 6, 5, 4, 3]);
  const late = daysEnding("2026-10-10", [1, 0, 1, 2, 1, 0, 1, 1, 0, 2]);
  const series = [...early, ...late];
  assert.deepEqual(hist.seriesGaps(series), [{ from: "2026-07-20", to: "2026-09-30", days: 73 }]);
  assert.deepEqual(hist.seriesGaps(daysEnding("2026-11-08", SG_14)), []);
  // a 2-day publishing lag is not a gap
  assert.deepEqual(hist.seriesGaps([{ date: "2026-11-01", value: 1 }, { date: "2026-11-04", value: 1 }]), []);
  const avg = hist.rollingMean(series);
  assert.equal(avg[0].date, "2026-07-16", "the average starts once 5 days are behind it");
  assert.ok(!avg.some(p => p.date > "2026-07-19" && p.date < "2026-10-05"), "no average is produced inside or just after the hole");
  const runs = hist.lineSegments(avg);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].at(-1).date, "2026-07-19");
  assert.equal(runs[1][0].date, "2026-10-05");
});

test("a tier change against last week is flagged, and only between two real comparisons", () => {
  const at = (ratio, extra = {}) => sig({ reading: reading(ratio * 100), norm1y: norm(100), ...extra });
  assert.equal(gate.tierMove(at(0.8), at(1)), "new");
  assert.equal(gate.tierMove(at(0.2), at(0.8)), "worse");
  assert.equal(gate.tierMove(at(0.8), at(0.2)), "eased");
  assert.equal(gate.tierMove(at(1), at(0.5)), "cleared");
  assert.equal(gate.tierMove(at(1.3), at(0.7)), "new", "crossing from below to above is a new signal");
  assert.equal(gate.tierMove(at(0.8), at(0.75)), null);
  assert.equal(gate.tierMove(at(1), at(1.05)), null);
  assert.equal(gate.tierMove(at(0.5), null), null);
  assert.equal(gate.tierMove(at(0.5), at(0.5, { fresh: false })), null);
  assert.equal(gate.tierMove(at(0.5, { norm1y: null }), at(1)), null);
  assert.deepEqual(["new", "worse", "eased", "cleared", null].map(gate.tierMoveText), ["New this week", "Worse this week", "Eased this week", "Back in range this week", ""]);
});

test("the globe and detail panels use the shared severity and history logic", async () => {
  const read = (p) => readFile(new URL(`../app/components/projects/${p}`, import.meta.url), "utf8");
  const [core, spark, intel] = await Promise.all([read("OilTrackerCore.tsx"), read("CorridorSpark.tsx"), read("oil/useOilIntelligence.ts")]);
  assert.ok(core.includes("const r = gateMarkRadius(sig);"), "mark size comes from the tested radius function");
  assert.ok(!/9 \+ 7 \* Math\.min/.test(core), "the compressed 9–16px scale is gone");
  assert.ok(core.includes("gateMarkRadius(corridor ? gateSignalsRef.current[corridor] : null)"), "hit-testing follows the mark size");
  assert.ok(spark.includes("dates={chartPoints.map(p => p.date)}"), "every sparkline is plotted against its dates");
  assert.ok(!spark.includes("i / (values.length - 1)"), "no sparkline is plotted by index");
  assert.ok(intel.includes("weeklyChange(history.points, signal.periodDate)"), "the change covers the same week as the reading");
});

/* ── per-gate significance: reference norm, own typical range, rank ── */
// a weekly spread as the backend stores it (core/weeklySpread.ts); values in tankers a day
const spread = (p50, mad, extra = {}) => ({ n: 365, min: p50 * 0.6, p05: p50 * 0.8, p10: p50 * 0.85, p25: p50 * 0.93, p50, p75: p50 * 1.07, p90: p50 * 1.15, p95: p50 * 1.2, max: p50 * 1.4, mad, sampleFrom: "2025-11-07", sampleTo: "2026-11-07", ...extra });

test("the reference norm is the 1-yr mean until it drifts 25% from the 5-yr mean", async () => {
  assert.equal(gate.GATE_NORM_SWITCH_DRIFT, 0.25);
  assert.equal(gate.referenceWindow(80, 100), "1y"); // −20%
  assert.equal(gate.referenceWindow(75, 100), "5y"); // exactly −25%
  assert.equal(gate.referenceWindow(125, 100), "5y"); // +25%: an inflated year hands over too
  assert.equal(gate.referenceWindow(124, 100), "1y");
  assert.equal(gate.referenceWindow(13, null), "1y");
  assert.equal(gate.referenceWindow(null, 46), "5y");
  assert.equal(gate.referenceWindow(null, null), null);
  // the six gates as stored on 17 Nov 2026 (1-yr mean, 5-yr mean)
  const stored = { hormuz: [13.071, 46.277], singapore: [76.465, 81.365], suez: [16.065, 18.364], bab_el_mandeb: [12.034, 16.869], cape: [18.354, 14.410], panama: [13.688, 12.622] };
  const refs = Object.fromEntries(Object.entries(stored).map(([id, [a, b]]) => [id, gate.referenceWindow(a, b)]));
  assert.deepEqual(refs, { hormuz: "5y", singapore: "1y", suez: "1y", bab_el_mandeb: "5y", cape: "5y", panama: "1y" });
  // a 5-yr norm alone is a norm: the gate is compared rather than left blank
  const only5y = sig({ reading: reading(10), norm1y: null, norm5y: norm(20) });
  assert.equal(only5y.state, "below");
  assert.equal(only5y.ref, "5y");
  assert.equal(only5y.switched, false);
  assert.equal(gate.gateStatusText(only5y), "50% of 5-yr norm");
  // an expired 5-yr norm cannot take over: the gate stays on its 1-yr norm
  const expired5y = sig({ reading: reading(1), norm1y: norm(13.071), norm5y: norm(46.277, { sampleTo: "2026-08-01" }) });
  assert.equal(expired5y.ref, "1y");
  // the score engine and the globe must switch at the same drift
  const engine = await readFile(new URL("../backend/src/scores/engine.ts", import.meta.url), "utf8");
  assert.equal(Number(engine.match(/export const NORM_SWITCH_DRIFT = ([\d.]+);/)?.[1]), gate.GATE_NORM_SWITCH_DRIFT);
});

test("a gate with a weekly spread is judged against its own usual swing, not the fixed 15%", () => {
  // steady gate: 7-day averages move ±4 around 76 → typical half-width 1.9 × 4 / 76.5 = 9.9%
  const steady = (value) => sig({ reading: reading(value), norm1y: norm(76.465, { weekly: spread(76.3, 4) }) });
  assert.equal(steady(76).bandBasis, "own");
  assert.equal(Math.round(steady(76).bandLow * 1000), 901);
  assert.equal(Math.round(steady(76).bandHigh * 1000), 1099);
  assert.equal(steady(69.5).state, "typical"); // 91% of norm
  assert.equal(steady(67.5).state, "below"); // 88% — inside the old fixed band, outside this gate's own
  assert.equal(steady(85).state, "above"); // 111%
  assert.equal(gate.gateTier(steady(67.5)), 1, "just outside a tight band is still the lowest tier");
  // erratic gate: ±22% is ordinary, so 82% of norm is not a signal
  const erratic = (value) => sig({ reading: reading(value), norm1y: norm(16, { weekly: spread(16, 1.85) }) });
  assert.equal(Math.round(erratic(16).bandLow * 100), 78);
  assert.equal(erratic(13.1).state, "typical"); // 82% — "below" under the old fixed band
  assert.equal(erratic(12).state, "below"); // 75%
  // the spread used is the reference window's own
  const switched = sig({ reading: reading(30), norm1y: norm(13.071, { weekly: spread(13, 0.2) }), norm5y: norm(46.277, { weekly: spread(52, 6) }) });
  assert.equal(switched.ref, "5y");
  assert.equal(Math.round(switched.bandLow * 1000), Math.round((1 - (1.9 * 6) / 46.277) * 1000));
  // text states which yardstick is in use
  assert.equal(gate.gateTypicalText(steady(76)), "typical for this gate is 90–110% of the 1-yr norm");
  assert.equal(gate.gateTypicalText(sig({ reading: reading(76), norm1y: norm(76.465) })), "typical is 85–115% of the 1-yr norm (fixed band)");
  assert.equal(gate.gateTypicalText(sig({ reading: reading(76), fresh: false, norm1y: norm(76.465) })), "");
});

test("the own band is clamped, and a missing or malformed spread falls back to the fixed band", () => {
  assert.equal(gate.typicalSpread(spread(100, 0), 100), gate.GATE_SPREAD_MIN, "a flat record cannot make a hair-trigger band");
  assert.equal(gate.typicalSpread(spread(100, 60), 100), gate.GATE_SPREAD_MAX, "half-normal traffic is never typical");
  assert.equal(Math.round(gate.typicalSpread(spread(100, 10), 100) * 100), 19);
  for (const bad of [null, undefined, {}, spread(100, NaN), spread(100, -1), spread(100, 5, { p50: "100" }), spread(100, 5, { max: undefined })]) {
    assert.equal(gate.typicalSpread(bad, 100), null);
    const s = sig({ reading: reading(88), norm1y: norm(100, { weekly: bad }) });
    assert.equal(s.bandBasis, "fixed");
    assert.equal(s.bandLow, gate.GATE_NEUTRAL_LOW);
    assert.equal(s.bandHigh, gate.GATE_NEUTRAL_HIGH);
    assert.equal(s.state, "typical");
    assert.equal(s.rank, null);
  }
  // no comparison, no band
  const stale = sig({ reading: reading(88), fresh: false, norm1y: norm(100, { weekly: spread(100, 5) }) });
  assert.equal(stale.bandLow, null);
  assert.equal(stale.bandBasis, null);
});

test("colour always agrees with the state, whatever the gate's own band", () => {
  const expected = { below: "low", typical: "neutral", above: "high" };
  for (const mad of [null, 0, 1.5, 4, 10, 20, 40]) {
    for (const ratio of [0, 0.05, 0.3, 0.5, 0.6, 0.84, 0.86, 0.94, 0.96, 1, 1.04, 1.06, 1.14, 1.16, 1.4, 1.6, 3]) {
      const s = sig({ reading: reading(ratio * 100), norm1y: norm(100, mad === null ? {} : { weekly: spread(100, mad) }) });
      const colour = gate.gateColourRatio(s);
      assert.equal(flowHealthBucket(colour), expected[s.state], `mad ${mad}, ratio ${ratio}`);
      if (mad === null && s.state !== "typical") assert.ok(Math.abs(colour - ratio) < 1e-9, "the fixed band leaves the colour scale untouched");
    }
  }
  // deeper shortfalls are never drawn paler, and anything at or under half the norm is full red
  const tight = (ratio) => gate.gateColourRatio(sig({ reading: reading(ratio * 100), norm1y: norm(100, { weekly: spread(100, 4) }) }));
  assert.ok(tight(0.9) > tight(0.7) && tight(0.7) > tight(0.55));
  assert.ok(tight(0.5) <= 0.5 && tight(0.2) <= 0.5);
  // no comparison, no colour
  assert.equal(gate.gateColourRatio(sig({ reading: reading(50), fresh: false, norm1y: norm(100) })), null);
  assert.equal(gate.gateColourRatio(sig({ reading: null, norm1y: norm(100) })), null);
  // an interrupted route takes the colour of its lowest-reading gate
  const low = sig({ reading: reading(30), norm1y: norm(100, { weekly: spread(100, 4) }) });
  const ok = sig({ reading: reading(100), norm1y: norm(100) });
  assert.equal(gate.routeWorstRatio([ok, low, undefined]), gate.gateColourRatio(low));
  assert.equal(gate.routeWorstRatio([undefined]), null);
});

test("rank places a reading among past weeks and never decides the state", () => {
  const w = spread(50, 3, { min: 30, p05: 40, p10: 43, p25: 47, p50: 50, p75: 53, p90: 57, p95: 60, max: 70 });
  const at = [29, 30, 40, 42, 45, 50, 53, 58, 60, 70, 71].map(v => gate.weeklyRankPosition(v, w));
  assert.deepEqual(at, ["lowest", "low5", "low5", "low10", "low25", "mid", "high25", "high10", "high5", "high5", "highest"]);
  const s = sig({ reading: reading(42), norm1y: norm(50, { weekly: w }) });
  assert.deepEqual(s.rank, { position: "low10", win: "1y", n: 365 });
  assert.equal(gate.gateRankText(s), "Lowest 10% of weeks in the past yr");
  assert.equal(gate.gateRankText(sig({ reading: reading(42), norm1y: norm(50) })), "", "no spread on file, no rank");
  // A long outage becomes part of the ranking: after ~40 weeks shut, a shut gate sits INSIDE the
  // 5-yr p10. The state must not follow the rank — the robust spread still reads it far below.
  const outage = spread(55, 5, { n: 1826, min: 0, p05: 0, p10: 0.8, p25: 44, p50: 55, p75: 60, p90: 64, p95: 66, max: 75 });
  const shut = sig({ reading: reading(1.0), norm1y: norm(13.071, { yoyPct: -73.5 }), norm5y: norm(46.277, { weekly: outage }) });
  assert.equal(shut.rank.position, "low25");
  assert.equal(gate.gateRankText(shut), "Lowest quarter of weeks in 5 yrs");
  assert.equal(shut.state, "below");
  assert.equal(gate.gateTier(shut), 3);
  assert.equal(shut.bandBasis, "own");
  assert.deepEqual(gate.gateContextParts(shut), ["Lowest quarter of weeks in 5 yrs", "8% of 1-yr norm (13.1/d)", "5-yr norm used: 1-yr norm is 72% below it"]);
});

test("the gap, tier and mark size are measured against the reference norm", () => {
  const hormuz = sig({ reading: reading(1.0), norm1y: norm(13.071), norm5y: norm(46.277) });
  assert.equal(hormuz.norm, 46.277);
  assert.equal(gate.gateShortfallText(hormuz), "about 45 fewer tankers a day");
  assert.equal(gate.gateShortfallShort(hormuz), "≈45 FEWER/D");
  assert.equal(gate.gateTier(hormuz), 3);
  assert.equal(Math.round(gate.gateMarkRadius(hormuz)), 26);
  // Bab el-Mandeb and Cape also sit on the 5-yr norm today; Cape is typical against it
  const bab = sig({ reading: reading(6.9), norm1y: norm(12.034), norm5y: norm(16.869) });
  assert.equal(gate.gateStatusText(bab), "41% of 5-yr norm");
  assert.equal(gate.gateTierText(bab), "Well below");
  assert.equal(gate.gateShortfallText(bab), "about 10.0 fewer tankers a day");
  const cape = sig({ reading: reading(15.9), norm1y: norm(18.354), norm5y: norm(14.410) });
  assert.equal(gate.gateStatusText(cape), "110% of 5-yr norm");
  assert.equal(cape.state, "typical");
  // a week-on-week tier move is read against the same reference as this week
  const lastWeek = sig({ reading: reading(8.6), norm1y: norm(12.034), norm5y: norm(16.869) });
  assert.equal(gate.tierMove(bab, lastWeek), null, "both weeks are 'well below' the 5-yr norm");
});

test("every surface reads colour, norm and band from the shared gate signal", async () => {
  const read = (p) => readFile(new URL(`../app/components/projects/${p}`, import.meta.url), "utf8");
  const [core, signals, block, chart, legend] = await Promise.all([read("OilTrackerCore.tsx"), read("oil/GateSignals.tsx"), read("oil/GateNormBlock.tsx"), read("oil/GateHistoryChart.tsx"), read("oil/FlowHealthLegend.tsx")]);
  assert.ok(core.includes("const ratio = gateColourRatio(sig) as number;"), "globe marks are coloured by state");
  assert.ok(core.includes("const sigRatio = sig ? gateColourRatio(sig) : null;"), "gate hotspots are coloured by state");
  assert.ok(!/flowHealth\((s|sig|g\.signal)\.ratio/.test(core + signals + block), "no surface colours a gate by its raw ratio");
  assert.ok(!core.includes("OF 1Y NORM ·"), "the hover card no longer computes its own 1-yr percent");
  assert.ok(core.includes("const sig = gateSignalOf(corridorId);"), "the hover card reads the shared signal");
  assert.ok(core.includes("<FlowHealthLegend basis={legendBasis} />"), "the map key says which yardstick is in use");
  assert.ok(chart.includes("const norm = signal.norm;") && chart.includes("norm * bandLow"), "the chart band is the gate's own band around its reference norm");
  assert.ok(!chart.includes("GATE_NEUTRAL"), "the chart no longer hardcodes the fixed band");
  assert.ok(block.includes("gateTypicalText(s)") && block.includes("gateRankText(s)"), "the detail panel states the band and the rank");
  assert.ok(legend.includes("5-yr once the 1-yr has drifted 25%"), "the map key states the norm rule");
});

