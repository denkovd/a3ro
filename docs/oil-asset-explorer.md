# Oil asset explorer (refineries)

Extends the Commodity Watch oil page so users can find a refinery, see who owns
and operates it, move to that company and back to its other sites, and follow
dated developments. Refinery coverage only; terminals, pipelines and upstream
projects are not modelled yet.

## What changed

- **Search and filter** (top-left of the map): refineries, companies, corridors,
  routes and countries. Filters cover operating evidence, country, company
  (direct or through a documented subsidiary) and "has dated developments".
  Non-matching markers dim; matches get a dashed ring; "Fit to map" frames them.
  The rail's refinery list follows the same filter.
- **Refinery drawer**: status, capacity (reference) beside throughput
  (unavailable), then four separate relationship blocks: *Owned by* (with the
  parent chain), *Operated by* (with former operators), *Supply & customers*,
  and *Nearby · proximity only*. Then dated developments, operating history,
  unit references and a sources footer.
- **Company drawer**: refineries in coverage with role badges and "via" chains,
  parent ownership, documented holdings, and sources. Selecting a company rings
  its sites on the globe and fits the camera to them.
- **Navigation**: entity links move between refineries and companies; the rail
  header shows "← previous". Every selection is a `?focus=` URL (`ref:<id>`,
  `co:<id>`, `bench:WTI`, `prod:<id>`, `route:<id>`, `gate:<id>` or a corridor
  id), so links can be shared and browser Back works.
- **Visual identity**: scoped tokens in `globals.css` (`.intel-surface`,
  `.oil-surface`, `.gold-surface`, `.btc-surface`): one accent per asset, shared
  status colours, and `--ink-3` lifted to 5.3:1 contrast inside the modules (the
  homepage is unchanged). Oil panel type floor raised to 10–11px. Shared
  primitives in `app/components/projects/intel/primitives.tsx` (provenance badge,
  timeline, source footer, entity link) are ready for gold and BTC.

## Data rules

Relationships live in `lib/oil/companies.ts`; graph logic in `lib/oil/assetGraph.ts`.

- Ownership (`owns`), operation (`operates`) and supply are separate types.
  Proximity is computed from coordinates and never stored.
- A company is recorded as owner only where a source says so. Operating a site
  does not imply ownership, and owners never inherit "operates".
- Stakes appear only where a source states them, always with the date they
  describe (`asOf`). Each record has an https source, review date and confidence
  (`operator`, `government`, `reported`).
- No supplier or customer relationship is documented, so none is shown.
- `project` and `ownership` refinery events are dated developments.
  `refineryCondition` ignores them, so they never imply an operating status.
- `npm run test:oil` validates all of the above (18 tests).

## Ownership records for review (reviewed 16 Nov 2026)

| Refinery | Operator | Documented owner and parents | Confidence |
|---|---|---|---|
| Al-Zour | KNPC (KIPIC until 1 Jul 2026) | KNPC ← KPC (share not stated) | Reported |
| Mina Al-Ahmadi, Mina Abdullah | KNPC | Not separately documented | — |
| YASREF | YASREF | YASREF ← Aramco 62.5%, Sinopec 37.5% (Apr 2025) | Reported |
| Dangote | Dangote Petroleum Refinery & Petrochemicals FZE | DORCL 65.835%, DIL 14.904%, NNPC 6.815%, Greenview 6.496% (pre-IPO, 7 Sep 2026; others 5.95%) | Reported |
| Sarroch | Sarlux | Sarlux ← Saras ← Varas 100% (Sep 2024) ← Vitol | Operator / reported |
| Singapore | ExxonMobil Asia Pacific | EMAPPL (owns and operates) · affiliate of Exxon Mobil Corp. | Operator |
| Grangemouth | Petroineos | Petroineos ← INEOS 50%, PCIL 50% (2011) | Operator |
| Bapco · Sitra | Bapco Refining | Bapco Refining ← Bapco Energies 100% ← Government of Bahrain 100% (2023) | Operator |
| Ruwais | ADNOC Refining | ADNOC Refining ← ADNOC 65%, Eni 20% (2019), OMV 15% (2025) | Operator |
| Jamnagar, Galveston Bay, Benicia, LA (P66), Haifa | Listed operator | Not separately documented | — |

Points to check before release:

- **Al-Zour operator change.** The record previously named KIPIC. KIPIC was
  dissolved into KNPC (reported June 2026; completion marked 1 July 2026). The
  `operator` field now reads "KNPC · formerly KIPIC".
- **Dangote.** Stakes are pre-IPO figures, reported by Nairametrics from the
  prospectus. Post-offer holdings are not recorded.
- **Grangemouth 50/50.** Based on the 2010 INEOS offer and the 2011 joint venture,
  not re-verified for 2026.

## Developments added

Al-Zour merger completion (Jul 2026), Yasref+ framework agreement (Apr 2025),
Dangote expansion in the IPO prospectus (Sep 2026) and IPO opening (Sep 2026),
Saras delisting (Sep 2024). No events were added to Grangemouth, Benicia,
Phillips 66 LA or Bapco: the refinery cron derives its HTML evidence checks from
those refineries' events, and a new event would create a failing check.

## Not done

Terminals, pipelines and upstream projects; supply and customer data; post-IPO
Dangote shareholding; ownership for the five refineries marked "not separately
documented"; applying the shared primitives to gold and BTC.
