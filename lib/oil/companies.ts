/** Companies and documented relationships for the refinery references in ./refineries.
 *
 * Rules (enforced by tests/oil-intelligence.test.mjs):
 * - Every record carries an https source, a review date and a confidence level.
 * - Ownership, operation and supply are separate relation types. Proximity is
 *   computed in ./assetGraph and is never stored as a relationship.
 * - A stake is recorded only when a source states it; otherwise stakePct is null.
 * - `asOf` is the date the source describes, not the date it was reviewed.
 * - Absence of a record means "not documented in this coverage", never "none".
 *
 * Client-safe: pure data, type-only imports.
 */
export type Confidence = "operator" | "government" | "reported";

export type Company = {
  id: string;
  name: string;
  aliases?: string[];
  country: string;
  kind: "company" | "state";
  note?: string;
  sourceUrl: string;
  reviewedAt: string;
};

type Dated = {
  id: string;
  /** Date the relationship began, when the source states it. */
  since?: string | null;
  /** Date the relationship ended, when the source states it. */
  until?: string | null;
  /** Date the source describes. */
  asOf: string | null;
  basis: string;
  sourceUrl: string;
  reviewedAt: string;
  confidence: Confidence;
};

/** Company → refinery. `operates` and `owns` are recorded separately. */
export type AssetRelation = Dated & { companyId: string; assetId: string; role: "operates" | "owns"; stakePct: number | null };

/** Company → company. `group` records a stated affiliation without an ownership share. */
export type CompanyRelation = Dated & { parentId: string; childId: string; role: "owns" | "group"; stakePct: number | null };

/** Supplier → customer for a product, optionally tied to a refinery. */
export type SupplyRelation = Dated & { supplierId: string; customerId: string; assetId?: string; product: string };

const reviewedAt = "2026-11-16";

const SRC = {
  kipicBrochure: "https://kipic.com.kw/wp-content/uploads/2023/12/Corporate-Brochure-2023-english.pdf",
  kipicMerger: "https://www.intellinews.com/kuwait-continues-mergers-as-knpc-absorbs-kipic-446300/",
  kipicMergerCeremony: "https://kuwaittimes.com/article/45801/business/kipic-knpc-merger-marks-strategic-milestone-for-kuwaits-oil-industry/",
  knpcAhmadi: "https://www.knpc.com/en/our-business/oil-refining/mina-al-ahmadi-refinery",
  knpcAbout: "https://www.knpc.com/en/about-us/who-we-are",
  yasref: "https://www.yasref.com/about-us",
  yasrefOwners: "https://ogj.com/refining-processing/petrochemicals/article/55281305/sinopec-aramco-to-add-major-petrochemical-capacity-at-yanbu-complex",
  dangote: "https://www.refinery-dangote.com/",
  dangoteShares: "https://nairametrics.com/2026/09/09/dangote-to-retain-84-34-control-of-refinery-after-planned-n2-15-trillion-ipo-prospectus-shows/",
  saras: "https://www.saras.it/en/what-we-do/refining",
  sarasControl: "https://en.ilsole24ore.com/art/the-sarroch-refinery-saras-jewel-here-fifth-fuels-italy-AFX9uEhC",
  sarasDelisting: "https://www.saras.it/sites/default/files/uploads/pressreleases/press-release-issued-by-saras-s.p.a.-on-behalf-of-varas-s.p.a.---press-release-final-results-of-the-reopening-of-the-terms.pdf",
  varasVitol: "https://www.calcioefinanza.it/?p=156145",
  bazan: "https://media.bazan.co.il/bazan/media/qlhn0z05/bazan-q4-2025.pdf",
  reliance: "https://www.ril.com/businesses/energy/refining-marketing",
  exxonOwnsOperates: "https://investor.exxonmobil.com/news-events/press-releases/detail/481/exxonmobil-to-produce-flagship-mobil-1-synthetic-engine-oil",
  exxonAffiliate: "https://corporate.exxonmobil.com/news/news-releases/2017/0216_exxonmobil-singapore-refinery-to-expand-group-ii-base-stock-production",
  marathon: "https://www.marathonpetroleum.com/Operations/Refining/Galveston-Bay-Refinery/",
  petroineos: "https://www.petroineos.com/about-us",
  petroineosGrangemouth: "https://www.petroineos.com/refining/grangemouth/",
  pcil: "https://www.petroineos.com/about-us/shareholders/petrochina",
  ineosOffer: "https://www.ineos.com/news/ineos-group/ineos-is-offered-1-billion-by-petrochina-for-a-50-share-in-its-european-refining-business/",
  valero: "https://www.valero.com/about/locations/benicia-refinery",
  p66: "https://investor.phillips66.com/financial-information/news-releases/news-release-details/2026/Phillips-66-Delivers-Strong-4Q-Operating-Results-While-Enhancing-Portfolio/default.aspx",
  bapcoRefining: "https://bapcoenergies.com/bapco-refining",
  bapcoReport: "https://issuu.com/bapco.bh/docs/bapco_refining_gri_2022-2023",
  adnocRefining: "https://www.adnoc.ae/en/adnoc-refining/about-us/locations",
  adnocPartners: "https://adnoc.ae/news-and-media/press-releases/2019/adnoc-closes-landmark-strategic-partnership-agreements-with-eni-and-omv-in-refining-and-trading",
  omv2025: "https://reports.omv.com/en/annual-report/2025/notes/notes-to-the-consolidated-financial-statements/equity-accounted-investments.html",
} as const;

export const COMPANIES: Company[] = [
  { id: "knpc", name: "Kuwait National Petroleum Company", aliases: ["KNPC"], country: "Kuwait", kind: "company", sourceUrl: SRC.knpcAbout, reviewedAt },
  { id: "kipic", name: "Kuwait Integrated Petroleum Industries Company", aliases: ["KIPIC"], country: "Kuwait", kind: "company", note: "Dissolved into KNPC; merger completion was marked on 1 July 2026.", sourceUrl: SRC.kipicBrochure, reviewedAt },
  { id: "kpc", name: "Kuwait Petroleum Corporation", aliases: ["KPC"], country: "Kuwait", kind: "company", sourceUrl: SRC.kipicBrochure, reviewedAt },
  { id: "yasref", name: "Yanbu Aramco Sinopec Refining Company", aliases: ["YASREF"], country: "Saudi Arabia", kind: "company", sourceUrl: SRC.yasref, reviewedAt },
  { id: "aramco", name: "Saudi Aramco", aliases: ["Aramco"], country: "Saudi Arabia", kind: "company", sourceUrl: SRC.yasrefOwners, reviewedAt },
  { id: "sinopec", name: "Sinopec", aliases: ["China Petroleum & Chemical Corporation"], country: "China", kind: "company", sourceUrl: SRC.yasrefOwners, reviewedAt },
  { id: "dangote-refinery", name: "Dangote Petroleum Refinery and Petrochemicals FZE", aliases: ["Dangote Petroleum Refinery", "DPRP"], country: "Nigeria", kind: "company", sourceUrl: SRC.dangote, reviewedAt },
  { id: "dorcl", name: "Dangote Oil Refining Company Limited", aliases: ["DORCL"], country: "Nigeria", kind: "company", sourceUrl: SRC.dangoteShares, reviewedAt },
  { id: "dil", name: "Dangote Industries Limited", aliases: ["DIL", "Dangote Group"], country: "Nigeria", kind: "company", sourceUrl: SRC.dangoteShares, reviewedAt },
  { id: "greenview", name: "Greenview International Corporation", country: "Not recorded", kind: "company", sourceUrl: SRC.dangoteShares, reviewedAt },
  { id: "nnpc", name: "NNPC Limited", aliases: ["NNPC", "Nigerian National Petroleum Company"], country: "Nigeria", kind: "company", sourceUrl: SRC.dangoteShares, reviewedAt },
  { id: "sarlux", name: "Sarlux", country: "Italy", kind: "company", sourceUrl: SRC.saras, reviewedAt },
  { id: "saras", name: "Saras S.p.A.", aliases: ["Saras"], country: "Italy", kind: "company", note: "Delisted from Euronext Milan in September 2024.", sourceUrl: SRC.sarasDelisting, reviewedAt },
  { id: "varas", name: "Varas S.p.A.", country: "Italy", kind: "company", sourceUrl: SRC.sarasDelisting, reviewedAt },
  { id: "vitol", name: "Vitol B.V.", aliases: ["Vitol"], country: "Netherlands", kind: "company", sourceUrl: SRC.varasVitol, reviewedAt },
  { id: "bazan", name: "Bazan Group", aliases: ["Bazan", "Oil Refineries Ltd"], country: "Israel", kind: "company", sourceUrl: SRC.bazan, reviewedAt },
  { id: "reliance", name: "Reliance Industries", aliases: ["RIL"], country: "India", kind: "company", sourceUrl: SRC.reliance, reviewedAt },
  { id: "exxon-ap", name: "ExxonMobil Asia Pacific Pte Ltd", aliases: ["EMAPPL"], country: "Singapore", kind: "company", sourceUrl: SRC.exxonOwnsOperates, reviewedAt },
  { id: "exxonmobil", name: "Exxon Mobil Corporation", aliases: ["ExxonMobil"], country: "United States", kind: "company", sourceUrl: SRC.exxonAffiliate, reviewedAt },
  { id: "marathon", name: "Marathon Petroleum", aliases: ["MPC"], country: "United States", kind: "company", sourceUrl: SRC.marathon, reviewedAt },
  { id: "petroineos", name: "Petroineos", country: "United Kingdom", kind: "company", sourceUrl: SRC.petroineos, reviewedAt },
  { id: "ineos", name: "INEOS", country: "United Kingdom", kind: "company", sourceUrl: SRC.ineosOffer, reviewedAt },
  { id: "pcil", name: "PetroChina International (London)", aliases: ["PCIL", "PetroChina"], country: "United Kingdom", kind: "company", sourceUrl: SRC.pcil, reviewedAt },
  { id: "valero", name: "Valero", aliases: ["Valero Energy"], country: "United States", kind: "company", sourceUrl: SRC.valero, reviewedAt },
  { id: "phillips66", name: "Phillips 66", country: "United States", kind: "company", sourceUrl: SRC.p66, reviewedAt },
  { id: "bapco-refining", name: "Bapco Refining", country: "Bahrain", kind: "company", sourceUrl: SRC.bapcoRefining, reviewedAt },
  { id: "bapco-energies", name: "Bapco Energies", country: "Bahrain", kind: "company", sourceUrl: SRC.bapcoReport, reviewedAt },
  { id: "gov-bahrain", name: "Government of Bahrain", country: "Bahrain", kind: "state", sourceUrl: SRC.bapcoReport, reviewedAt },
  { id: "adnoc-refining", name: "ADNOC Refining", aliases: ["Abu Dhabi Oil Refining Company", "Takreer"], country: "United Arab Emirates", kind: "company", sourceUrl: SRC.adnocRefining, reviewedAt },
  { id: "adnoc", name: "ADNOC", aliases: ["Abu Dhabi National Oil Company"], country: "United Arab Emirates", kind: "company", sourceUrl: SRC.adnocPartners, reviewedAt },
  { id: "eni", name: "Eni", country: "Italy", kind: "company", sourceUrl: SRC.adnocPartners, reviewedAt },
  { id: "omv", name: "OMV", country: "Austria", kind: "company", sourceUrl: SRC.omv2025, reviewedAt },
];

const op = (id: string, companyId: string, assetId: string, basis: string, sourceUrl: string, extra: Partial<AssetRelation> = {}): AssetRelation =>
  ({ id, companyId, assetId, role: "operates", stakePct: null, asOf: null, basis, sourceUrl, reviewedAt, confidence: "operator", ...extra });
const own = (id: string, companyId: string, assetId: string, basis: string, sourceUrl: string, extra: Partial<AssetRelation> = {}): AssetRelation =>
  ({ id, companyId, assetId, role: "owns", stakePct: null, asOf: null, basis, sourceUrl, reviewedAt, confidence: "operator", ...extra });

export const ASSET_RELATIONS: AssetRelation[] = [
  op("al-zour:op:kipic", "kipic", "al-zour", "Built and operated Al-Zour until its merger into KNPC.", SRC.kipicBrochure, { since: "2016-10-18", until: "2026-07-01" }),
  op("al-zour:op:knpc", "knpc", "al-zour", "KIPIC was dissolved and its assets, including Al-Zour, transferred to KNPC.", SRC.kipicMerger, { asOf: "2026-06-02", confidence: "reported" }),
  own("al-zour:own:knpc", "knpc", "al-zour", "KIPIC's assets, including Al-Zour, were transferred to KNPC under the merger.", SRC.kipicMerger, { asOf: "2026-06-02", confidence: "reported" }),
  op("mina-ahmadi:op:knpc", "knpc", "mina-ahmadi", "Operator-published refinery profile.", SRC.knpcAhmadi),
  op("mina-abdullah:op:knpc", "knpc", "mina-abdullah", "Operator-published company profile.", SRC.knpcAbout),
  op("yasref:op:yasref", "yasref", "yasref", "Operator-published company profile.", SRC.yasref),
  own("yasref:own:yasref", "yasref", "yasref", "Reported as the jointly owned Yanbu Aramco Sinopec Refining Co. refinery.", SRC.yasrefOwners, { asOf: "2025-04-09", confidence: "reported" }),
  op("dangote:op:dprp", "dangote-refinery", "dangote", "Operator-published refinery site.", SRC.dangote),
  own("dangote:own:dprp", "dangote-refinery", "dangote", "Refinery company whose shares were offered in the September 2026 IPO prospectus.", SRC.dangoteShares, { asOf: "2026-09-07", confidence: "reported" }),
  op("sarroch:op:sarlux", "sarlux", "sarroch", "Operator-published refining profile.", SRC.saras),
  op("haifa-bazan:op:bazan", "bazan", "haifa-bazan", "Operator 2025 annual report.", SRC.bazan),
  op("jamnagar:op:reliance", "reliance", "jamnagar", "Operator-published refining profile.", SRC.reliance),
  op("singapore-exxon:op:emappl", "exxon-ap", "singapore-exxon", "ExxonMobil states its Singapore affiliate owns and operates the refinery.", SRC.exxonOwnsOperates, { asOf: "2015-09-15" }),
  own("singapore-exxon:own:emappl", "exxon-ap", "singapore-exxon", "ExxonMobil states its Singapore affiliate owns and operates the refinery.", SRC.exxonOwnsOperates, { asOf: "2015-09-15" }),
  op("galveston-bay:op:marathon", "marathon", "galveston-bay", "Operator-published refinery profile.", SRC.marathon),
  op("grangemouth:op:petroineos", "petroineos", "grangemouth", "Operator-published site profile · now a fuel import and distribution terminal.", SRC.petroineosGrangemouth),
  own("grangemouth:own:petroineos", "petroineos", "grangemouth", "PCIL states the 2011 joint venture gave it joint ownership of Grangemouth.", SRC.pcil, { asOf: "2011" }),
  op("benicia:op:valero", "valero", "benicia", "Operator-published refinery profile.", SRC.valero),
  op("los-angeles-p66:op:p66", "phillips66", "los-angeles-p66", "Operator results statement on Los Angeles refinery fuel production.", SRC.p66, { asOf: "2026-02-04" }),
  op("bapco:op:bapco-refining", "bapco-refining", "bapco", "Bapco Energies states Bapco Refining owns and operates the refinery.", SRC.bapcoRefining),
  own("bapco:own:bapco-refining", "bapco-refining", "bapco", "Bapco Energies states Bapco Refining owns and operates the refinery.", SRC.bapcoRefining),
  op("ruwais:op:adnoc-refining", "adnoc-refining", "ruwais", "Operator-published locations page.", SRC.adnocRefining),
  own("ruwais:own:adnoc-refining", "adnoc-refining", "ruwais", "ADNOC describes the Ruwais refineries as ADNOC Refining's own.", SRC.adnocPartners, { asOf: "2019" }),
];

const parent = (id: string, parentId: string, childId: string, stakePct: number | null, basis: string, sourceUrl: string, extra: Partial<CompanyRelation> = {}): CompanyRelation =>
  ({ id, parentId, childId, role: "owns", stakePct, asOf: null, basis, sourceUrl, reviewedAt, confidence: "operator", ...extra });

export const COMPANY_RELATIONS: CompanyRelation[] = [
  parent("kpc>kipic", "kpc", "kipic", null, "Established as a KPC subsidiary.", SRC.kipicBrochure, { since: "2016-10-18", until: "2026-07-01" }),
  parent("kpc>knpc", "kpc", "knpc", null, "Reported as KNPC's parent firm.", SRC.kipicMerger, { asOf: "2026-06-02", confidence: "reported" }),
  parent("aramco>yasref", "aramco", "yasref", 62.5, "Reported joint-venture shareholding.", SRC.yasrefOwners, { asOf: "2025-04-09", confidence: "reported" }),
  parent("sinopec>yasref", "sinopec", "yasref", 37.5, "Reported joint-venture shareholding.", SRC.yasrefOwners, { asOf: "2025-04-09", confidence: "reported" }),
  parent("dorcl>dprp", "dorcl", "dangote-refinery", 65.835, "Pre-IPO shareholding reported from the prospectus. Post-offer holdings are not recorded.", SRC.dangoteShares, { asOf: "2026-09-07", confidence: "reported" }),
  parent("dil>dprp", "dil", "dangote-refinery", 14.904, "Pre-IPO shareholding reported from the prospectus. Post-offer holdings are not recorded.", SRC.dangoteShares, { asOf: "2026-09-07", confidence: "reported" }),
  parent("nnpc>dprp", "nnpc", "dangote-refinery", 6.815, "Pre-IPO shareholding reported from the prospectus. Post-offer holdings are not recorded.", SRC.dangoteShares, { asOf: "2026-09-07", confidence: "reported" }),
  parent("greenview>dprp", "greenview", "dangote-refinery", 6.496, "Pre-IPO shareholding reported from the prospectus. Post-offer holdings are not recorded.", SRC.dangoteShares, { asOf: "2026-09-07", confidence: "reported" }),
  parent("saras>sarlux", "saras", "sarlux", null, "Reported: Saras controls the refinery through Sarlux.", SRC.sarasControl, { confidence: "reported" }),
  parent("varas>saras", "varas", "saras", 100, "Held 95.285% after the reopened tender offer and exercised its purchase right over the remaining 4.715%.", SRC.sarasDelisting, { asOf: "2024-09-03" }),
  parent("vitol>varas", "vitol", "varas", null, "Saras board statement reported Varas as indirectly controlled by Vitol through Varas Holding.", SRC.varasVitol, { asOf: "2024-06-18", confidence: "reported" }),
  { id: "exxonmobil~emappl", parentId: "exxonmobil", childId: "exxon-ap", role: "group", stakePct: null, asOf: "2017-02-16", basis: "Described by ExxonMobil as its Singapore affiliate. Ownership share not stated.", sourceUrl: SRC.exxonAffiliate, reviewedAt, confidence: "operator" },
  parent("ineos>petroineos", "ineos", "petroineos", 50, "PetroChina offered for a 50% share of INEOS's European refining business; the joint venture formed in 2011.", SRC.ineosOffer, { asOf: "2011" }),
  parent("pcil>petroineos", "pcil", "petroineos", 50, "PetroChina offered for a 50% share of INEOS's European refining business; the joint venture formed in 2011.", SRC.ineosOffer, { asOf: "2011" }),
  parent("bapco-energies>bapco-refining", "bapco-energies", "bapco-refining", 100, "Wholly owned by Bapco Energies.", SRC.bapcoReport, { asOf: "2023" }),
  parent("gov-bahrain>bapco-energies", "gov-bahrain", "bapco-energies", 100, "Bapco Energies is wholly owned by the Government of Bahrain.", SRC.bapcoReport, { asOf: "2023" }),
  parent("adnoc>adnoc-refining", "adnoc", "adnoc-refining", 65, "Shareholding on completion of the Eni and OMV transaction.", SRC.adnocPartners, { asOf: "2019" }),
  parent("eni>adnoc-refining", "eni", "adnoc-refining", 20, "Shareholding on completion of the Eni and OMV transaction.", SRC.adnocPartners, { asOf: "2019" }),
  parent("omv>adnoc-refining", "omv", "adnoc-refining", 15, "OMV 2025 annual report: 15% interest (2024: 15%).", SRC.omv2025, { asOf: "2025-12-31" }),
];

/** No supplier or customer relationship is documented in this coverage. */
export const SUPPLY_RELATIONS: SupplyRelation[] = [];
