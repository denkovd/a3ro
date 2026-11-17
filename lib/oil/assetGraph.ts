/** Pure navigation helpers over refineries and their documented relationships.
 * Data is passed in, so every function is testable without module resolution.
 * Proximity is computed here and is never stored or presented as a relationship.
 */
import type { Refinery } from "./refineries";
import type { AssetRelation, Company, CompanyRelation, SupplyRelation } from "./companies";

export type Graph = {
  refineries: Refinery[];
  companies: Company[];
  assetRelations: AssetRelation[];
  companyRelations: CompanyRelation[];
  supplyRelations: SupplyRelation[];
};

const day = (d: string) => Date.parse(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);

/** Current unless the source records an end date that has passed. */
export function isCurrent(r: { until?: string | null }, now = Date.now()) {
  return !r.until || day(r.until) > now;
}

export function companyById(g: Graph, id: string) {
  return g.companies.find(c => c.id === id) ?? null;
}

export function assetRelationsFor(g: Graph, assetId: string, now = Date.now()) {
  const rels = g.assetRelations.filter(r => r.assetId === assetId);
  return {
    operators: rels.filter(r => r.role === "operates" && isCurrent(r, now)),
    owners: rels.filter(r => r.role === "owns" && isCurrent(r, now)),
    former: rels.filter(r => !isCurrent(r, now)),
    supply: g.supplyRelations.filter(s => s.assetId === assetId),
  };
}

export type ChainLink = { relation: CompanyRelation; company: Company | null; depth: number };

/** Parents of a company, nearest first. Cycles and unknown ids stop the walk. */
export function ownershipChain(g: Graph, companyId: string, now = Date.now(), maxDepth = 6): ChainLink[] {
  const out: ChainLink[] = [];
  const seen = new Set([companyId]);
  let frontier = [companyId];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const relation of g.companyRelations.filter(r => r.childId === id && isCurrent(r, now))) {
        out.push({ relation, company: companyById(g, relation.parentId), depth });
        if (!seen.has(relation.parentId)) { seen.add(relation.parentId); next.push(relation.parentId); }
      }
    }
    frontier = next;
  }
  return out;
}

export function subsidiaries(g: Graph, companyId: string, now = Date.now()) {
  return g.companyRelations.filter(r => r.parentId === companyId && isCurrent(r, now));
}

export type CompanyAsset = { refinery: Refinery; roles: ("operates" | "owns")[]; via: string[]; former: boolean };

/** Refineries a company operates or owns directly, plus those held through
 * documented subsidiaries (`via` lists the intermediate company ids). */
export function companyAssets(g: Graph, companyId: string, now = Date.now()): CompanyAsset[] {
  const byAsset = new Map<string, CompanyAsset>();
  const add = (rel: AssetRelation, via: string[]) => {
    const refinery = g.refineries.find(r => r.id === rel.assetId);
    if (!refinery) return;
    const former = !isCurrent(rel, now);
    const key = `${rel.assetId}|${former}`;
    const entry = byAsset.get(key) ?? { refinery, roles: [], via, former };
    if (!entry.roles.includes(rel.role)) entry.roles.push(rel.role);
    if (via.length < entry.via.length) entry.via = via;
    byAsset.set(key, entry);
  };
  const seen = new Set<string>();
  const walk = (id: string, via: string[]) => {
    if (seen.has(id) || via.length > 6) return;
    seen.add(id);
    for (const rel of g.assetRelations.filter(r => r.companyId === id)) {
      if (via.length && rel.role === "operates") continue; // operating is not inherited by owners
      if (via.length && !isCurrent(rel, now)) continue;
      add(rel, via);
    }
    for (const child of subsidiaries(g, id, now).filter(r => r.role === "owns")) walk(child.childId, [...via, child.childId]);
  };
  walk(companyId, []);
  return [...byAsset.values()].sort((a, b) => Number(a.former) - Number(b.former) || a.via.length - b.via.length || a.refinery.name.localeCompare(b.refinery.name));
}

const R_EARTH_KM = 6371;
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type NearbyAsset = { refinery: Refinery; km: number; sharedCorridor: string | null };

/** Geographic proximity only. A shared corridor id is reported separately and
 * implies no commercial relationship. */
export function nearbyAssets(g: Graph, assetId: string, radiusKm = 400): NearbyAsset[] {
  const self = g.refineries.find(r => r.id === assetId);
  if (!self) return [];
  return g.refineries
    .filter(r => r.id !== assetId)
    .map(r => ({ refinery: r, km: distanceKm(self, r), sharedCorridor: self.corridorId && self.corridorId === r.corridorId ? self.corridorId : null }))
    .filter(n => n.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

export type StatusBucket = "closed" | "disrupted" | "unverified";
export type RefineryFilter = { status: "all" | StatusBucket; country: string | null; companyId: string | null; developments: boolean };
export const EMPTY_FILTER: RefineryFilter = { status: "all", country: null, companyId: null, developments: false };

export function filterIsActive(f: RefineryFilter) {
  return f.status !== "all" || f.country !== null || f.companyId !== null || f.developments;
}

/** Ids of refineries matching every active facet. `statusOf` keeps evidence rules in one place. */
export function filterRefineries(g: Graph, f: RefineryFilter, statusOf: (r: Refinery) => string, now = Date.now()): Set<string> {
  const companyIds = f.companyId ? new Set(companyAssets(g, f.companyId, now).filter(a => !a.former).map(a => a.refinery.id)) : null;
  return new Set(g.refineries.filter(r => {
    const status = statusOf(r);
    if (f.status === "closed" && !["closed", "idled"].includes(status)) return false;
    if (f.status === "disrupted" && !r.events.some(e => ["outage", "disruption", "maintenance"].includes(e.kind))) return false;
    if (f.status === "unverified" && status !== "unknown") return false;
    if (f.country && r.country !== f.country) return false;
    if (companyIds && !companyIds.has(r.id)) return false;
    if (f.developments && r.events.length === 0) return false;
    return true;
  }).map(r => r.id));
}

export type SearchKind = "refinery" | "company" | "corridor" | "route" | "country";
/** `terms` are names of the entity itself; `context` (operator, country) can match but ranks lowest. */
export type SearchItem = { kind: SearchKind; id: string; label: string; detail: string; terms: string[]; context?: string[] };
export type SearchHit = SearchItem & { score: number };

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Builds the search corpus. Corridors and routes come from the existing map catalogue. */
export function searchCorpus(g: Graph, extra: { corridors: { id: string; title: string }[]; routes: { id: string; name: string }[] }): SearchItem[] {
  const countries = [...new Set(g.refineries.map(r => r.country))].sort();
  return [
    ...g.refineries.map(r => ({ kind: "refinery" as const, id: r.id, label: r.name, detail: `${r.country} · ${r.operator}`, terms: [r.name], context: [r.operator, r.country] })),
    ...g.companies.filter(c => g.assetRelations.some(r => r.companyId === c.id) || g.companyRelations.some(r => r.parentId === c.id || r.childId === c.id))
      .map(c => ({ kind: "company" as const, id: c.id, label: c.name, detail: c.kind === "state" ? "State owner" : c.country, terms: [c.name, ...(c.aliases ?? [])] })),
    ...extra.corridors.map(c => ({ kind: "corridor" as const, id: c.id, label: c.title, detail: "Corridor", terms: [c.title] })),
    ...extra.routes.map(r => ({ kind: "route" as const, id: r.id, label: r.name, detail: "Illustrative flow route", terms: [r.name] })),
    ...countries.map(c => ({ kind: "country" as const, id: c, label: c, detail: `${g.refineries.filter(r => r.country === c).length} refinery references`, terms: [c] })),
  ];
}

/** Exact > prefix > word-start > substring > context-only match. */
export function searchEntities(corpus: SearchItem[], query: string, limit = 8): SearchHit[] {
  const q = fold(query.trim());
  if (!q) return [];
  const kindRank: Record<SearchKind, number> = { refinery: 0, company: 1, country: 2, corridor: 3, route: 4 };
  return corpus.flatMap(item => {
    let best = 0;
    for (const term of item.terms.map(fold)) {
      const score = term === q ? 4 : term.startsWith(q) ? 3 : term.split(/[\s·/()-]+/).some(w => w.startsWith(q)) ? 2 : term.includes(q) ? 1 : 0;
      best = Math.max(best, score);
    }
    if (!best && (item.context ?? []).some(term => fold(term).includes(q))) best = 0.5;
    return best ? [{ ...item, score: best }] : [];
  }).sort((a, b) => b.score - a.score || kindRank[a.kind] - kindRank[b.kind] || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Camera target for a set of sites: mean unit vector, zoom from angular spread. */
export function fitView(sites: { lon: number; lat: number }[]) {
  if (!sites.length) return null;
  const rad = Math.PI / 180;
  let x = 0, y = 0, z = 0;
  for (const s of sites) {
    x += Math.cos(s.lat * rad) * Math.cos(s.lon * rad);
    y += Math.cos(s.lat * rad) * Math.sin(s.lon * rad);
    z += Math.sin(s.lat * rad);
  }
  const lon = Math.atan2(y, x) / rad;
  const lat = Math.atan2(z, Math.hypot(x, y)) / rad;
  const spread = Math.max(0, ...sites.map(s => distanceKm({ lon, lat }, s))) / 111;
  const zoom = Math.min(1.5, Math.max(0.9, 1.5 - spread / 70));
  return { lon, lat, zoom };
}

export type ValidationIssue = { id: string; problem: string };

/** Structural checks for every stored relationship. Used by tests and dev assertions. */
export function validateGraph(g: Graph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const companyIds = new Set(g.companies.map(c => c.id));
  const assetIds = new Set(g.refineries.map(r => r.id));
  const ids = new Set<string>();
  const sourced = (id: string, r: { sourceUrl: string; reviewedAt: string; basis?: string; confidence?: string }) => {
    if (!/^https:\/\//.test(r.sourceUrl)) issues.push({ id, problem: "source must be an https URL" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt)) issues.push({ id, problem: "review date must be YYYY-MM-DD" });
    if (r.basis !== undefined && r.basis.trim().length < 10) issues.push({ id, problem: "basis must describe the evidence" });
    if (r.confidence !== undefined && !["operator", "government", "reported"].includes(r.confidence)) issues.push({ id, problem: "unknown confidence" });
  };
  const unique = (id: string) => { if (ids.has(id)) issues.push({ id, problem: "duplicate id" }); ids.add(id); };
  for (const c of g.companies) { unique(`company:${c.id}`); sourced(c.id, c); }
  for (const r of g.assetRelations) {
    unique(r.id); sourced(r.id, r);
    if (!companyIds.has(r.companyId)) issues.push({ id: r.id, problem: `unknown company ${r.companyId}` });
    if (!assetIds.has(r.assetId)) issues.push({ id: r.id, problem: `unknown refinery ${r.assetId}` });
    if (!["operates", "owns"].includes(r.role)) issues.push({ id: r.id, problem: "asset role must be operates or owns" });
    if (r.role === "operates" && r.stakePct !== null) issues.push({ id: r.id, problem: "operation carries no ownership stake" });
  }
  for (const r of g.companyRelations) {
    unique(r.id); sourced(r.id, r);
    if (!companyIds.has(r.parentId) || !companyIds.has(r.childId)) issues.push({ id: r.id, problem: "unknown company" });
    if (r.parentId === r.childId) issues.push({ id: r.id, problem: "company cannot own itself" });
    if (r.role === "group" && r.stakePct !== null) issues.push({ id: r.id, problem: "group affiliation carries no stake" });
    if (r.stakePct !== null && !(r.stakePct > 0 && r.stakePct <= 100)) issues.push({ id: r.id, problem: "stake must be within (0, 100]" });
    if (r.stakePct !== null && !r.asOf) issues.push({ id: r.id, problem: "a stake needs the date it describes" });
  }
  const totals = new Map<string, number>();
  for (const r of g.companyRelations) if (r.role === "owns" && r.stakePct !== null && isCurrent(r)) totals.set(r.childId, (totals.get(r.childId) ?? 0) + r.stakePct);
  for (const [child, total] of totals) if (total > 100.0001) issues.push({ id: child, problem: `recorded stakes total ${total}%` });
  for (const s of g.supplyRelations) {
    unique(s.id); sourced(s.id, s);
    if (!companyIds.has(s.supplierId) || !companyIds.has(s.customerId)) issues.push({ id: s.id, problem: "unknown company" });
    if (s.assetId && !assetIds.has(s.assetId)) issues.push({ id: s.id, problem: "unknown refinery" });
  }
  for (const r of g.refineries) if (!g.assetRelations.some(a => a.assetId === r.id && a.role === "operates" && isCurrent(a))) issues.push({ id: r.id, problem: "no current documented operator" });
  return issues;
}
