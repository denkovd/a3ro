/* ────────────────────────────────────────────────────────────────
   Your write-ups for the free asset pages (roadmap #38).

   Keyed by the page's slug (the part after /assets/ in its URL:
   "aapl", "brk-b", "btc-usd", "asx-bhp"). Pages without a note still
   show the chart and profile; a note is what makes a page worth
   reading and worth finding in search.

   Keep it general information: what the asset is, why you're
   watching it, how it fits the macro backdrop. No buy/sell calls or
   price targets (personal-advice risk, roadmap #20).
──────────────────────────────────────────────────────────────── */

export interface AssetNote {
  /** Date you last checked this note, YYYY-MM-DD. Shown on the page. */
  updated: string;
  /** One line under the name, e.g. "Australia's largest miner and the purest iron ore read". */
  summary: string;
  /** Paragraphs of your write-up. */
  body: string[];
  /** Optional: what you're watching next, short lines. */
  watching?: string[];
}

export const ASSET_NOTES: Readonly<Record<string, AssetNote>> = {
  // Example — copy, change the slug and write your own:
  // "asx-bhp": {
  //   updated: "2026-11-24",
  //   summary: "Australia's largest miner and a direct read on iron ore and China's steel demand.",
  //   body: ["…", "…"],
  //   watching: ["China steel output (monthly)", "Port Hedland shipments"],
  // },
};
