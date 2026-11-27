import type { Metadata } from "next";
import { MethodologyPage, Term } from "../content";
import { ATR_LEN, BULL_UNIVERSE, DONCHIAN_LEN, NEWLY_BULLISH_MAX_AGE, RS_LOOKBACK } from "@a3ro/oil-backend";

export const metadata: Metadata = {
  title: "Bull Market Finder methodology — A3RO Intelligence",
  description: "How Bull Market Finder reads trends: the Money Line rule, daily and weekly confirmation, ranking, relative strength and the limits of free price data.",
  alternates: { canonical: "/methodology/bull-market-finder" },
};

const TIERS = [
  { tier: "macro", label: "Macro 30", what: "indexes, currencies, bonds, commodities and bitcoin that set the backdrop" },
  { tier: "us_large", label: "US 500", what: "S&P 500 companies" },
  { tier: "ndx_extra", label: "NDX+", what: "Nasdaq-100 companies not in the S&P 500" },
  { tier: "crypto", label: "Crypto", what: "the larger crypto assets" },
  { tier: "etf", label: "ETFs", what: "liquid sector, country, factor and commodity funds" },
] as const;

export default function BullMarketFinderMethodology() {
  const count = (t: string) => BULL_UNIVERSE.filter((e) => e.tier === t).length;
  return <MethodologyPage title="Bull Market Finder" updated="27 November 2026" moduleHref="/Projects/Bull-Market-Finder" moduleLabel="Bull Market Finder">
    <p>Bull Market Finder scans about {Math.round(BULL_UNIVERSE.length / 10) * 10} assets every day and sorts them by trend: which have just turned up, which are still up, which are mixed and which are down. It answers &ldquo;what is trending, and since when?&rdquo;. It doesn&rsquo;t say what to buy, and a trend can end the day after it starts.</p>

    <h2 id="universe">What it scans</h2>
    <ul>{TIERS.map((t) => <li key={t.tier}><strong>{t.label}</strong> ({count(t.tier)}): {t.what}.</li>)}</ul>
    <p>The lists are kept in our code and refreshed each quarter, so index changes show up within a few months. Each asset appears once, in the first group it belongs to.</p>

    <h2 id="money-line">The trend rule: the Money Line</h2>
    <p>Each asset&rsquo;s trend comes from one rule, the <Term id="money-line">Money Line</Term>, applied separately to daily and weekly candles:</p>
    <ol>
      <li>Take the highest high and lowest low of the previous {DONCHIAN_LEN} candles (a <Term id="donchian-channel">Donchian channel</Term>), not counting the current one.</li>
      <li>The trend turns up when a candle <em>closes</em> above the top of that channel, and down when it closes below the bottom. A price that pokes through during the day and falls back doesn&rsquo;t count.</li>
      <li>Once up, the line sits at the channel&rsquo;s low and can only rise (it <Term id="ratchet">ratchets</Term>). The trend stays up until a close below that line. Downtrends mirror this.</li>
    </ol>
    <p>The weekly candle only counts once the week has closed, so the current week never changes a weekly reading. Until an asset has enough history and a first close outside the channel, it shows as <strong>warming up</strong>.</p>

    <h2 id="states">Daily and weekly together</h2>
    <p>The main view combines the two timeframes:</p>
    <ul>
      <li><strong>Double confirmed:</strong> up on both daily and weekly.</li>
      <li><strong>Conflicted, early bullish:</strong> the daily has turned up but the weekly hasn&rsquo;t yet. Often the start of a move, often a false start.</li>
      <li><strong>Conflicted, lagging bullish:</strong> the weekly is still up but the daily has broken down. Often a pullback inside an uptrend, sometimes the end of it.</li>
      <li><strong>Bearish:</strong> down on both.</li>
    </ul>
    <p><strong>Newly bullish</strong> means double confirmed within the last {NEWLY_BULLISH_MAX_AGE} trading days. The Daily and Weekly views apply the rule to one timeframe only: the daily view reacts fastest and changes most, the weekly view is slowest. The <strong>Lens</strong> column shows how the other views read the same asset, so you can see where they agree.</p>

    <h2 id="ranking">How assets are ranked</h2>
    <ol>
      <li>By group: newly bullish, then bullish, early bullish, lagging bullish, bearish and warming up.</li>
      <li>Within a group, the most recent change comes first.</li>
      <li>Ties are broken by <Term id="strength">volatility-adjusted strength</Term>: how far the price sits above its line plus how far it has moved since the trend turned, divided by its typical daily range (<Term id="atr">ATR</Term>, {ATR_LEN} days). This stops naturally jumpy assets, such as small crypto, from always ranking above steady ones.</li>
    </ol>
    <p><Term id="relative-strength">RS 63d</Term> is the asset&rsquo;s return over the last {RS_LOOKBACK} trading days (about a quarter) minus its benchmark&rsquo;s: the S&amp;P 500 for shares and funds, bitcoin for crypto. It&rsquo;s shown for context and doesn&rsquo;t affect the ranking.</p>

    <h2 id="data">Data</h2>
    <ul>
      <li>Daily prices come from free public sources, with backups when the main source fails or returns old data. Each day&rsquo;s scan runs after the US close.</li>
      <li>Prices are adjusted for stock splits, so a split doesn&rsquo;t look like a crash.</li>
      <li>Oil and gold futures are joined across contract rolls by shifting older prices by each roll&rsquo;s gap, so a roll doesn&rsquo;t fake a breakout. This adjustment only started when the scanner went live (July 2026); older history uses the raw joined series.</li>
      <li>The <strong>Transitions</strong> list records every change of state between daily scans.</li>
    </ul>

    <h2 id="limits">What it can&rsquo;t tell you</h2>
    <ul>
      <li>Trend rules are late by design: they wait for a close beyond the recent range, so they miss the first part of every move and give some back at the end.</li>
      <li>In sideways markets they flip back and forth, and each flip can lose money.</li>
      <li>A signal says nothing about valuation, news or position size. Past trends don&rsquo;t predict future returns.</li>
    </ul>
  </MethodologyPage>;
}
