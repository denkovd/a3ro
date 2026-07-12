/* ────────────────────────────────────────────────────────────────
   Thesis Lab — the linguistic lexicon behind the pressure test.

   Deliberately rule-based, not model-based: every marker the engine
   reacts to is listed HERE, verbatim, so a scored thesis can always
   be traced back to the exact words that moved its numbers (the
   house explainability rule — no opaque scores). The cost is that a
   novel phrasing can slip through unscored; the honest trade is
   documented in DECISIONS.md.

   All matching is case-insensitive on word boundaries.
──────────────────────────────────────────────────────────────── */

/** Strong-assertion markers → raise STATED confidence. */
export const CERTAINTY_MARKERS = [
  "will", "definitely", "certainly", "clearly", "obviously", "no doubt",
  "guaranteed", "inevitable", "inevitably", "has to", "must", "always",
  "never", "can't", "cannot", "no way", "without question", "for sure",
  "undoubtedly", "everyone knows", "bound to", "sure to", "locked in",
] as const;

/** Hedges → lower stated confidence (honest uncertainty, not weakness). */
export const HEDGE_MARKERS = [
  "might", "may", "could", "maybe", "perhaps", "possibly", "likely",
  "probably", "seems", "appears", "should", "i think", "i believe",
  "i suspect", "roughly", "around", "about", "potentially", "arguably",
  "if", "unless", "risk that", "chance that",
] as const;

/** Absolutes — the subset of certainty markers that also add FRAGILITY:
 *  "always/never/can't" claims snap on a single counter-example. */
export const ABSOLUTE_MARKERS = [
  "always", "never", "can't", "cannot", "no way", "impossible",
  "guaranteed", "inevitable", "everyone knows", "has to", "must",
] as const;

/** Named checkable sources → raise evidence. */
export const DATA_SOURCE_MARKERS = [
  "eia", "opec", "iea", "cftc", "cot", "fred", "fed", "bls", "api ",
  "jodi", "baker hughes", "rig count", "wpsr", "report", "data",
  "survey", "print", "release", "filing", "statement",
] as const;

/** Mechanism words — causal chains. A chain with numbers is analysis;
 *  a chain without numbers is a story (fragility). */
export const CAUSAL_MARKERS = [
  "because", "therefore", "so ", "which means", "leads to", "drives",
  "forces", "implies", "hence", "thus", "as a result", "due to",
] as const;

/* ── claim-kind keyword families ──────────────────────────────── */

export const KIND_KEYWORDS: Record<string, readonly string[]> = {
  direction: [
    "going to", "target", "heading", "rally", "rallies", "breaks out",
    "break out", "sell off", "sells off", "upside", "downside", "double",
    "moon", "crash", "collapse", "squeeze higher", "retest", "reprice",
    "re-rate", "outperform", "underperform", "long", "short", "buy", "sell",
  ],
  supply: [
    "opec", "opec+", "production", "output", "supply", "inventories",
    "inventory", "stocks", "stockpile", "draw", "draws", "drawing", "build",
    "builds", "spare capacity", "shut-in", "outage", "disruption", "cuts",
    "quota", "exports", "wells", "rig", "refinery", "refining", "capacity",
    "shale", "drilling",
  ],
  demand: [
    "demand", "consumption", "china", "india", "recovery", "recovering",
    "reopening", "travel", "driving season", "jet fuel", "industrial activity",
    "pmi", "growth picks up", "buyers", "appetite",
  ],
  macro: [
    "fed", "rates", "rate cut", "rate cuts", "rate hike", "dollar", "usd",
    "dxy", "inflation", "cpi", "recession", "soft landing", "liquidity",
    "credit", "yields", "curve", "stimulus", "easing", "tightening", "qt",
    "qe", "macro",
  ],
  positioning: [
    "positioning", "cot", "managed money", "funds", "cta", "ctas", "specs",
    "speculators", "shorts", "longs", "short interest", "squeeze",
    "capitulation", "flows", "unwind", "crowded", "consensus", "everyone is",
    "nobody owns", "under-owned", "underowned", "over-owned",
  ],
  timing: [
    "by january", "by february", "by march", "by april", "by may", "by june",
    "by july", "by august", "by september", "by october", "by november",
    "by december", "this week", "this month", "this quarter", "this year",
    "within", "in the next", "by year end", "by year-end", "by eoy",
    "next month", "next quarter", "before",
  ],
  level: [
    "support", "resistance", "oversold", "overbought", "cheap", "expensive",
    "undervalued", "overvalued", "fair value", "discount", "premium",
    "base", "floor", "ceiling", "range",
  ],
} as const;

/* ── instrument aliases (thesis text → symbol) ────────────────────
   Oil benchmarks resolve to the price stores that actually exist
   (latest_quotes / daily_prices); everything else must match the bull
   universe by symbol at context-assembly time. */

export const INSTRUMENT_ALIASES: { symbol: string; label: string; aliases: readonly string[]; oilAdjacent: boolean }[] = [
  { symbol: "WTI", label: "WTI Crude", aliases: ["wti", "crude", "oil", "cl ", "/cl", "nymex crude", "us crude"], oilAdjacent: true },
  { symbol: "BRENT", label: "Brent Crude", aliases: ["brent"], oilAdjacent: true },
  { symbol: "GC=F", label: "Gold", aliases: ["gold", "xau", "gc "], oilAdjacent: false },
  { symbol: "SI=F", label: "Silver", aliases: ["silver", "xag"], oilAdjacent: false },
  { symbol: "BTC-USD", label: "Bitcoin", aliases: ["bitcoin", "btc"], oilAdjacent: false },
  { symbol: "ETH-USD", label: "Ethereum", aliases: ["ethereum", "eth "], oilAdjacent: false },
  { symbol: "^GSPC", label: "S&P 500", aliases: ["s&p", "spx", "sp500", "s&p 500", "es "], oilAdjacent: false },
  { symbol: "^NDX", label: "Nasdaq 100", aliases: ["nasdaq", "ndx", "qqq"], oilAdjacent: false },
  { symbol: "NG=F", label: "Nat Gas", aliases: ["nat gas", "natural gas", "natgas", "henry hub"], oilAdjacent: false },
  { symbol: "DX-Y.NYB", label: "Dollar Index", aliases: ["dxy", "dollar index"], oilAdjacent: false },
];

/** Month-name → month index for timing extraction. */
export const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/* ── matching helpers (pure) ──────────────────────────────────── */

/** All lexicon phrases found in `text`, verbatim from the list. */
export function findMarkers(text: string, markers: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const m of markers) {
    // Word-boundary-ish: avoid "will" matching "willing" but let
    // multi-word phrases match as substrings.
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
    const re = m.includes(" ")
      ? new RegExp(escaped, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) found.push(m.trim());
  }
  return found;
}

/** Numbers with market meaning: "$95", "95.50", "2mb/d", "5%", "1.2 million". */
export function findNumericEvidence(text: string): string[] {
  const out: string[] = [];
  const re = /(\$\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:%|mb\/?d|kb\/?d|bcf|mmbbl|mbbl|million|billion|bps|x)\b|\b\d{2,}(?:[.,]\d+)?\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
    if (out.length >= 12) break; // cap — beyond this it's a table, not a sentence
  }
  return out;
}
