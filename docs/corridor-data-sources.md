# Corridor Data Sources — Scoping

Maps each modeled Oil Tracker panel to real candidate feeds, with access mechanics, cost, and cadence.
Benchmark prices (WTI/Brent) are already live via `/api/oil/latest` + `/api/oil/series`; this covers the rest.
Researched 2026-07-05.

## Per-panel mapping

### Corridor 01 — Strait of Hormuz (throughput, corridor flow)
| Source | Access | Cost | Cadence | Notes |
|---|---|---|---|---|
| IMF PortWatch | ArcGIS FeatureServer REST + CSV/GeoJSON download | Free | Updated weekly (Tue 9 AM ET), daily datapoints, ~4-day processing lag | Daily transit calls + preliminary trade-volume estimates for 28 chokepoints (Hormuz = `chokepoint6`; also covers Bab el-Mandeb, Suez — the two TICKS on the globe). Caveat: AIS jamming/spoofing in the region — PortWatch itself flags Hormuz data quality. |
| Kpler / Vortexa | Commercial API | $$$ (quote) | Near-real-time | Actual seaborne flow Mb/d. The upgrade path if the panel must show true flow rather than transit counts. |

Fit: replace "Est. throughput 80%" with a transit-calls trend vs. trailing baseline; the existing `spark` becomes real PortWatch daily data. Display must say "weekly satellite estimate · ~4d lag" — the `staleness` machinery already models this.

### Demand 01 — China · East Coast
| Source | Access | Cost | Cadence | Notes |
|---|---|---|---|---|
| GACC customs | Bulletin scrape / manual | Free | Monthly | Official total imports (incl. pipeline). No clean API. |
| JODI | CSV download | Free | Monthly, ~2-month lag | Standardized imports/refinery intake/stocks where reported. |
| Kpler / Vortexa | Commercial API | $$$ | Daily-ish | Seaborne imports; the only way to make this panel genuinely near-real-time. Note methodology gap: Dec-25 customs 13.18 Mb/d vs Kpler/Vortexa ~12 Mb/d seaborne (pipeline excluded). |

Fit: free tier gives a monthly "import posture" figure + derived stockpile inference (imports − refinery runs). This panel's stated metric (near-real-time demand pressure) is honestly commercial-only; keep it modeled until there's budget.

### Corridor 02 — Singapore Strait
| Source | Access | Cost | Cadence | Notes |
|---|---|---|---|---|
| IMF PortWatch | Same as Hormuz | Free | Weekly publish, daily datapoints | Malacca/Singapore chokepoint transits → "transit density". |
| MPA via data.gov.sg | `https://data.gov.sg/api/action/datastore_search?resource_id=<id>` | Free | Monthly | Bunker sales by type (`d_4f5abbf4486bf8e52bbed3be56dde562`), vessel arrivals total (`d_d48c5a038904f6da3c603cd854b6c191`), breakdown (`d_8f264219109e61fffa87ac64dd5a9a65`), plus a tanker-arrivals collection. Official, clean JSON. |

Fit: best free coverage of any panel — all three rows (transit density, eastbound share proxy, bunker demand) can be real.

### Corridor 03 — ARA · Rotterdam
| Source | Access | Cost | Cadence | Notes |
|---|---|---|---|---|
| Insights Global ARA inventories | Email/CSV delivery (no public API) | Commercial (30-day free trial) | Weekly, Thu 16:15 CET | The canonical ARA product-stocks number Reuters quotes. Ingestion would be CSV-drop, not REST. |
| Crack spreads (derived) | Existing yfinance/AlphaVantage adapters: RBOB/heating-oil vs CL=F, ICE gasoil vs BZ=F | Free | Intraday/daily | "Crack pressure" row computed from futures already reachable with current source adapters — no new vendor. |

Fit: crack pressure can go live cheaply; product tightness stays modeled or goes commercial.

### Corridor 04 — US Gulf (reserved slot)
| Source | Access | Cost | Cadence | Notes |
|---|---|---|---|---|
| EIA API v2 | REST, free API key (`api.eia.gov/v2`) | Free | Weekly (WPSR) + monthly | Crude exports, refinery utilization, stocks. `backend/src/sources/eia.ts` already exists — extend, don't build. |

Fit: cheapest activation in the whole system; turns the reserved slot into the first fully real corridor.

## Recommended sequencing

1. **US Gulf via EIA** — free, official, adapter exists. First real corridor.
2. **Hormuz + Singapore transits via PortWatch** — one new adapter covers two panels plus both globe TICKS (Suez, Bab el-Mandeb).
3. **Singapore bunker/arrivals via data.gov.sg** — trivial JSON API, completes Corridor 02.
4. **ARA crack pressure from existing futures adapters** — derived metric, no new vendor.
5. **China + ARA stocks** — decide commercial budget (Kpler/Vortexa, Insights Global) or keep modeled with monthly free anchors (JODI/customs).

## Architecture notes

Each source becomes a `SourceDescriptor` + adapter in `backend/src/sources/` following the existing pattern (rate limits, confidence, `expectedCadenceMs`, publication lag). Corridor metrics land in a new `corridor_metrics` table keyed by `(corridor, metric, period)`, exposed via a read-only `/api/oil/corridors` route; `useOilData` grows a `corridors` field. The existing `Staleness` classification handles the monthly-vs-weekly-vs-daily cadence mismatch — panels display honesty about lag instead of pretending to be live.

## Sources

- [IMF PortWatch — Data & Methodology](https://portwatch.imf.org/pages/data-and-methodology)
- [IMF PortWatch — Daily Chokepoint Transit Calls dataset](https://portwatch.imf.org/datasets/42132aa4e2fc4d41bdaf9a445f688931_0/about)
- [IMF PortWatch — Strait of Hormuz (chokepoint6)](https://portwatch.imf.org/pages/chokepoint6)
- [EIA Open Data / API v2](https://www.eia.gov/opendata/)
- [EIA API technical documentation](https://www.eia.gov/opendata/documentation.php)
- [data.gov.sg — Bunker Sales, Monthly (MPA)](https://data.gov.sg/collections/388/view)
- [data.gov.sg — Vessel Arrivals (>75 GT), Monthly (MPA)](https://data.gov.sg/collections/394/view)
- [data.gov.sg — Tanker Arrivals (>75 GT), Monthly (MPA)](https://data.gov.sg/collections/392/view)
- [Insights Global — ARA Oil Product Inventories](https://www.insights-global.com/our-services/data-services/ara-oil-product-inventories/)
- [Energy News — China 2025/December import levels (customs vs trackers)](https://energynews.oedigital.com/fossil-fuels/2026/01/14/chinas-oil-imports-in-2025-and-december-inflows-are-both-at-record-levels)
- [Baird Maritime — China crude imports early 2026 (customs vs Kpler)](https://www.bairdmaritime.com/shipping/tankers/china-crude-oil-imports-rise-in-first-two-months-of-2026)
