/** Curated operator references. Coordinates represent sites/complexes, not unit footprints.
 * Capacity is a published reference, never a reading of current runs or available capacity.
 * Reviewed 2026-10-10. No operational status is inferred from an operator profile.
 */
export type RefineryEvent = {
  id?: string; incidentId?: string;
  date: string; title: string; detail: string; sourceUrl: string;
  kind: "closure" | "idled" | "outage" | "maintenance" | "restart" | "disruption" | "notice";
  scope?: "facility" | "unit" | "group";
  verifiedAt?: string; publishedAt?: string | null; expiresAt?: string;
  confidence?: "operator" | "government" | "reported";
  affectedUnits?: string[]; affectedProducts?: string[];
  affectedCapacityKbd?: number | null; expectedRestart?: string | null;
};
export type Refinery = {
  id: string; name: string; operator: string; country: string;
  lon: number; lat: number; capacityKbd: number | null;
  capacityBasis: string; sourceUrl: string; reviewedAt: string;
  context: string; corridorId?: string; events: RefineryEvent[];
  units?: { name: string; capacityKbd: number; sourceUrl: string; basis: string }[];
};
const reviewedAt = "2026-10-10";
const bazanReport = "https://media.bazan.co.il/bazan/media/qlhn0z05/bazan-q4-2025.pdf";
export const REFINERIES: Refinery[] = [
  { id: "al-zour", name: "Al-Zour", operator: "KIPIC", country: "Kuwait", lon: 48.31, lat: 28.74,
    capacityKbd: 615, capacityBasis: "Operator-published maximum refining capacity · February 2025 reference",
    sourceUrl: "https://kipic.com.kw/wp-content/uploads/2025/02/Kipic-2025-Feb-eng.pdf", reviewedAt: "2026-10-11", corridorId: "hormuz",
    context: "Coastal fuel export refinery. The operator's 2025 capacity milestone does not establish present runs or export availability.", events: [] },
  { id: "yasref", name: "Yanbu · YASREF", operator: "YASREF · Aramco / Sinopec", country: "Saudi Arabia", lon: 38.26, lat: 23.96,
    capacityKbd: 400, capacityBasis: "Operator-published Arabian heavy crude processing design reference",
    sourceUrl: "https://www.yasref.com/about-us", reviewedAt: "2026-10-11",
    context: "Red Sea refinery supplying domestic and international fuel markets. Its coastal location does not establish available bypass or export capacity.", events: [] },
  { id: "dangote", name: "Dangote · Lekki", operator: "Dangote Petroleum Refinery", country: "Nigeria", lon: 3.86, lat: 6.43,
    capacityKbd: 650, capacityBasis: "Operator-published crude processing nameplate · single train",
    sourceUrl: "https://www.refinery-dangote.com/", reviewedAt: "2026-10-11",
    context: "Atlantic coast refinery serving Nigerian and international product markets. Nameplate capacity and expansion plans do not establish current throughput.", events: [] },
  { id: "sarroch", name: "Sarroch", operator: "Sarlux · Saras", country: "Italy", lon: 9.01, lat: 39.07,
    capacityKbd: 300, capacityBasis: "Operator-published processing capacity · 15 million tonnes per year; daily reference calculated on calendar days",
    sourceUrl: "https://www.saras.it/en/what-we-do/refining", reviewedAt: "2026-10-11",
    context: "Sardinian refinery and storage complex in the Mediterranean fuel supply system. Storage capacity does not establish current stocks or available fuel exports.", events: [] },
  { id: "haifa-bazan", name: "Haifa · Bazan", operator: "Bazan", country: "Israel", lon: 35.05, lat: 32.80,
    capacityKbd: 197, capacityBasis: "Operator 2025 annual report · crude distillation reference; PDF page 55",
    sourceUrl: bazanReport, reviewedAt: "2026-10-11",
    context: "Conflict-damaged complex dependent on steam, electricity and external infrastructure. Historical recovery reports do not establish current operating status.",
    units: [
      { name: "CDU 1", capacityKbd: 27, basis: "Published crude processing reference", sourceUrl: `${bazanReport}#page=55` },
      { name: "CDU 3", capacityKbd: 57, basis: "Published crude processing reference", sourceUrl: `${bazanReport}#page=55` },
      { name: "CDU 4", capacityKbd: 113, basis: "Published crude processing reference", sourceUrl: `${bazanReport}#page=55` },
      { name: "Hydrocracker (HCU)", capacityKbd: 36, basis: "Published conversion-unit reference · overlaps crude processing", sourceUrl: `${bazanReport}#page=55` },
    ],
    events: [
      { id: "bazan-maintenance-2025-q1", date: "2025-01", kind: "maintenance", scope: "unit", confidence: "operator", title: "Q1 2025 unit maintenance", detail: "Hydrocracker, hydrogen facilities and CDU 3 underwent maintenance in Q1 2025. Month denotes quarter start; lost throughput and restart dates were not quantified.", affectedUnits: ["Hydrocracker (HCU)", "Hydrogen production", "CDU 3"], sourceUrl: `${bazanReport}#page=56` },
      { id: "bazan-conflict-2025-06", incidentId: "bazan-conflict-2025", date: "2025-06", kind: "outage", scope: "facility", confidence: "operator", title: "June 2025 conflict shutdown", detail: "Missile damage to the Energy Center and connections halted refining. The report describes a gradual return towards full activity in Q3/Q4 2025.", affectedUnits: ["Energy Center", "Inter-facility pipelines and transmission"], sourceUrl: `${bazanReport}#page=170` },
      { id: "bazan-conflict-2026-03-19", incidentId: "bazan-conflict-2026", date: "2026-03-19", kind: "disruption", scope: "group", confidence: "operator", title: "March 2026 damage and recovery", detail: "The annual report records local damage and interruption to third-party infrastructure, subsequently reactivated; most production facilities were active at report approval. Facility throughput was not quantified.", sourceUrl: `${bazanReport}#page=204` },
    ] },
  { id: "jamnagar", name: "Jamnagar complex", operator: "Reliance Industries", country: "India", lon: 69.85, lat: 22.35,
    capacityKbd: 1400, capacityBasis: "Operator-published crude processing capacity · combined complex",
    sourceUrl: "https://www.ril.com/businesses/energy/refining-marketing", reviewedAt,
    context: "Large integrated processing complex serving domestic and export markets. Complex-level capacity includes multiple refineries.", events: [] },
  { id: "mina-ahmadi", name: "Mina Al-Ahmadi", operator: "KNPC", country: "Kuwait", lon: 48.16, lat: 29.07,
    capacityKbd: 346, capacityBasis: "Operator-published refining capacity",
    sourceUrl: "https://www.knpc.com/en/our-business/oil-refining/mina-al-ahmadi-refinery", reviewedAt,
    context: "Coastal refinery with upgraded low-sulfur fuel production. Gulf seaborne export access is exposed to the Hormuz corridor.", corridorId: "hormuz", events: [] },
  { id: "mina-abdullah", name: "Mina Abdullah", operator: "KNPC", country: "Kuwait", lon: 48.16, lat: 29.00,
    capacityKbd: 454, capacityBasis: "Operator-published refining capacity",
    sourceUrl: "https://www.knpc.com/en/about-us/who-we-are", reviewedAt,
    context: "Part of Kuwait's downstream system. Its capacity reference does not establish current throughput or export availability.", corridorId: "hormuz", events: [] },
  { id: "singapore-exxon", name: "Singapore complex", operator: "ExxonMobil", country: "Singapore", lon: 103.70, lat: 1.26,
    capacityKbd: 592, capacityBasis: "Combined nameplate capacity · two connected sites",
    sourceUrl: "https://corporate.exxonmobil.com/locations/singapore/our-operations", reviewedAt,
    context: "Integrated refinery sites serving Singapore and Asia-Pacific fuel, lubricant and chemical markets.", corridorId: "sg", events: [] },
  { id: "galveston-bay", name: "Galveston Bay", operator: "Marathon Petroleum", country: "United States", lon: -94.92, lat: 29.38,
    capacityKbd: 631, capacityBasis: "Crude refining capacity · barrels per calendar day",
    sourceUrl: "https://www.marathonpetroleum.com/Operations/Refining/Galveston-Bay-Refinery/", reviewedAt,
    context: "Texas City refining complex linked to the US Gulf supply system. PADD 3 utilization is regional context, not this facility's utilization.", corridorId: "usgc", events: [] },
  { id: "grangemouth", name: "Grangemouth", operator: "Petroineos", country: "United Kingdom", lon: -3.70, lat: 56.02,
    capacityKbd: null, capacityBasis: "Refining ceased · now a fuel import and distribution terminal",
    sourceUrl: "https://www.petroineos.com/refining/grangemouth/", reviewedAt,
    context: "The site transitioned from refining to importing finished fuels, changing the region's supply dependence.",
    events: [{ date: "2025-04", kind: "closure", title: "Refining ceased", detail: "Operator confirms refinery operations ended in April 2025 and the business became a fuel import and distribution terminal.", sourceUrl: "https://www.petroineos.com/refining/grangemouth/" }] },
  { id: "benicia", name: "Benicia", operator: "Valero", country: "United States", lon: -122.13, lat: 38.07,
    capacityKbd: 170, capacityBasis: "Historical throughput capacity · processing units idled April 2026",
    sourceUrl: "https://www.valero.com/about/locations/benicia-refinery", reviewedAt,
    context: "Idled refinery in Northern California. Alternative supply arrangements and imports replace its fuel production.",
    events: [{ id: "benicia-idled-2026", incidentId: "benicia-idling", date: "2026-04", kind: "idled", title: "All processing units idled", detail: "Valero confirms that fuel production ceased during the first quarter and full processing-unit idling was completed in April 2026.", sourceUrl: "https://www.valero.com/about/locations/benicia-refinery", confidence: "operator", scope: "facility" }] },
  { id: "los-angeles-p66", name: "Los Angeles · Phillips 66", operator: "Phillips 66", country: "United States", lon: -118.26, lat: 33.79,
    capacityKbd: 139, capacityBasis: "Historical calendar-day capacity · CEC reference · fuel production ceased Q4 2025",
    sourceUrl: "https://www.energy.ca.gov/data-reports/energy-almanac/californias-petroleum-market/californias-oil-refineries/california-oil", reviewedAt,
    context: "Closed fuel-production capacity in the Los Angeles area. The former refinery capacity is historical, not available processing capacity.",
    events: [{ id: "p66-la-closure-2025", incidentId: "p66-la-closure", date: "2025-10", publishedAt: "2026-02-04", kind: "closure", title: "Fuel production ceased in Q4 2025", detail: "Phillips 66 confirmed cessation of Los Angeles refinery fuel production in its fourth-quarter results. The date denotes the beginning of the reported quarter.", sourceUrl: "https://investor.phillips66.com/financial-information/news-releases/news-release-details/2026/Phillips-66-Delivers-Strong-4Q-Operating-Results-While-Enhancing-Portfolio/default.aspx", confidence: "operator", scope: "facility" }] },
  { id: "bapco", name: "Bapco · Sitra", operator: "Bapco Refining", country: "Bahrain", lon: 50.61, lat: 26.09,
    capacityKbd: null, capacityBasis: "Capacity under review following modernization · current throughput unavailable",
    sourceUrl: "https://www.bapcoenergies.com/bapco-refining", reviewedAt, corridorId: "hormuz",
    context: "Gulf refinery with a documented conflict-related disruption. Group recovery statements provide context but do not quantify facility throughput or affected capacity.",
    events: [
      { id: "bapco-conflict-2026-03-09", incidentId: "bapco-conflict-2026", date: "2026-03-09", publishedAt: "2026-03-09", kind: "disruption", scope: "group", confidence: "operator", title: "Force majeure after refinery attack", detail: "Bapco declared force majeure on group operations following regional conflict and an attack on its refinery complex. It did not quantify the capacity unavailable.", sourceUrl: "https://www.bapcoenergies.com/media-centre/press-releases/bapco-energies-declares-force-majeure-situation-on-the-groups-operations" },
      { id: "bapco-recovery-2026-10-07", incidentId: "bapco-conflict-2026", date: "2026-10-07", publishedAt: "2026-10-07", kind: "notice", scope: "group", confidence: "operator", title: "Group recovery and normalization reported", detail: "The board reviewed recovery and normalization of group operations. Facility-level runs and remaining capacity constraints were not quantified.", sourceUrl: "https://www.bapcoenergies.com/media-centre/press-releases/bapco-energies-board-reviews-business-recovery-and-group-performance" },
    ] },
  { id: "ruwais", name: "Ruwais complex", operator: "ADNOC Refining", country: "United Arab Emirates", lon: 52.73, lat: 24.09,
    capacityKbd: 922, capacityBasis: "Operator-published complex capacity · barrels per stream day · crude and condensate",
    sourceUrl: "https://www.adnoc.ae/en/adnoc-refining/about-us/locations", reviewedAt, corridorId: "hormuz",
    context: "Crude and condensate processing complex supplying fuels and feedstocks. Its stream-day capacity cannot be directly summed with calendar-day capacity references.", events: [] },
];

export function mergeRefineryEvents(r: Refinery, incoming: RefineryEvent[] = []) {
  const events = new Map<string, RefineryEvent>();
  for (const e of [...r.events, ...incoming]) events.set(e.id ?? `${r.id}:${e.kind}:${e.date}`, e);
  return [...events.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function refineryCondition(r: Refinery, now = Date.now()) {
  const facility = mergeRefineryEvents(r).filter(e => (!e.scope || e.scope === "facility") && ["closure","idled","outage","maintenance","restart"].includes(e.kind));
  const latest = facility.find(e => Date.parse(e.date) <= now);
  const planned = facility.find(e => Date.parse(e.date) > now);
  if (!latest && planned) return { status: "scheduled", label: `${planned.kind === "maintenance" ? "Maintenance" : "Operating change"} scheduled`, color: "#d4a157" } as const;
  const eventDate = Date.parse(latest?.date ?? "");
  if (latest?.kind === "closure") return { status: "closed", label: "Refining ceased", color: "#d4a157" } as const;
  if (latest?.kind === "idled") return { status: "idled", label: "Processing units idled", color: "#d4a157" } as const;
  const published = Date.parse(latest?.publishedAt ?? latest?.date ?? "");
  const verified = Date.parse(latest?.verifiedAt ?? r.reviewedAt);
  const expires = latest?.expiresAt ? Date.parse(latest.expiresAt) : published + 14 * 86_400_000;
  const recent = latest && eventDate <= now && published <= now && now <= expires && verified <= now && now - verified <= 7 * 86_400_000;
  if (recent && latest?.kind === "outage") return { status: "outage", label: "Outage reported", color: "#e87869" } as const;
  if (recent && latest?.kind === "maintenance") return { status: "maintenance", label: "Maintenance reported", color: "#d4a157" } as const;
  if (recent && latest?.kind === "restart") return { status: "restart", label: "Restart reported", color: "#5fc9a4" } as const;
  return { status: "unknown", label: "Operating status unverified", color: "#9bada9" } as const;
}

export function refineryStatus(r: Refinery, now = Date.now()) {
  return refineryCondition(r, now).label;
}

export function capacityLabel(r: Refinery) {
  return r.capacityKbd === null ? "Capacity unavailable" : `${r.capacityKbd.toLocaleString()} kb/d`;
}
