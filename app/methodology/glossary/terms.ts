/* Glossary entries (roadmap #29). Ids are link targets: /methodology/glossary#<id>. */
export type GlossaryEntry = { id: string; term: string; def: string };
export const GLOSSARY: { title: string; entries: GlossaryEntry[] }[] = [
  { title: "Trends and price", entries: [
    { id: "money-line", term: "Money Line", def: "A3RO's trend rule. The trend turns up when a candle closes above the highest high of the previous 20 candles and down when it closes below the lowest low, then follows a line that only moves in the trend's favour." },
    { id: "donchian-channel", term: "Donchian channel", def: "The band between the highest high and lowest low of a set number of past candles. A close outside it is a breakout." },
    { id: "ratchet", term: "Ratchet", def: "A level that can only move one way. In an uptrend the Money Line can rise but never fall, so the exit level tightens as the price climbs." },
    { id: "flip", term: "Flip", def: "A change of trend from up to down or down to up, confirmed only when a candle closes." },
    { id: "atr", term: "ATR (average true range)", def: "An asset's typical daily price range, here averaged over 14 days and shown as a percentage of the price. A measure of how jumpy it is." },
    { id: "strength", term: "Volatility-adjusted strength", def: "How far a price is above its trend line plus how far it has moved since the trend turned, divided by its ATR, so calm and jumpy assets can be compared." },
    { id: "relative-strength", term: "Relative strength (RS 63d)", def: "An asset's return over about a quarter (63 trading days) minus its benchmark's return over the same period. Positive means it beat the benchmark." },
    { id: "drawdown", term: "Maximum drawdown", def: "The largest fall from a peak to a later low over a period, as a percentage. It shows the worst loss someone buying at the top would have sat through." },
    { id: "beta", term: "Beta", def: "How far something has tended to move when its benchmark moves. A beta of 2 means it has usually moved about twice as far, up and down." },
    { id: "correlation", term: "Correlation and R²", def: "Correlation (from −1 to 1) measures how closely two series move together. R² is how much of one series' movement the other explains, from 0 to 100%." },
    { id: "continuous-futures", term: "Continuous futures (roll-adjusted)", def: "A single price history stitched from successive futures contracts. Shifting older prices by the gap at each roll stops the switch from looking like a price jump." },
    { id: "stock-split", term: "Stock split", def: "A company dividing each share into several. The price falls in proportion but nothing is lost, so price histories are adjusted to match." },
    { id: "regime", term: "Regime", def: "The broad backdrop for markets, such as growth rising with inflation falling, which tends to favour some assets over others." },
  ] },
  { title: "Economy and statistics", entries: [
    { id: "leading", term: "Leading indicator", def: "A series that tends to turn before the wider economy, such as building approvals or job vacancies. Useful early, but prone to false signals." },
    { id: "coincident", term: "Coincident indicator", def: "A series that moves with the economy, such as hours worked or spending." },
    { id: "lagging", term: "Lagging indicator", def: "A series that turns after the economy has, such as unemployment or inflation. It confirms a turn rather than warning of one." },
    { id: "z-score", term: "Z-score", def: "How unusual a value is compared with its own history: the number of standard deviations it sits above (+) or below (−) its average. About two-thirds of past values fall between −1 and +1." },
    { id: "diffusion", term: "Diffusion", def: "The share of a group of series moving the same way, for example 7 of 10 leading indicators improving is 70%. It shows how broad a move is, not how big." },
    { id: "annual-change", term: "Annual change (year on year)", def: "The change from the same month or quarter a year earlier. It removes regular seasonal swings." },
    { id: "seasonally-adjusted", term: "Seasonally adjusted", def: "A series with its regular calendar pattern (Christmas spending, summer holidays) removed, so one month can be compared with the next." },
    { id: "trimmed-mean", term: "Trimmed-mean inflation", def: "Inflation with the biggest price rises and falls each period left out. The RBA watches it as a measure of underlying inflation." },
    { id: "basis-point", term: "Basis point", def: "One hundredth of a percentage point. A rise in the cash rate from 4.35% to 4.60% is 25 basis points." },
    { id: "yield-curve", term: "Yield curve", def: "The gap between long-term and short-term bond yields (here 10-year less 3-year). A narrow or negative gap has often come before slowdowns." },
    { id: "credit-spread", term: "Credit spread", def: "The extra yield companies pay to borrow over the government. It widens when lenders worry about defaults." },
    { id: "twi", term: "Trade-weighted index (TWI)", def: "The Australian dollar measured against a basket of trading partners' currencies, weighted by how much Australia trades with each." },
    { id: "cli", term: "Composite leading indicator", def: "The OECD's index combining several leading series. 100 is the long-term trend; above 100 and rising suggests growth above trend ahead." },
    { id: "revision", term: "Revision", def: "A change to an already published figure when more complete information arrives." },
  ] },
  { title: "Crypto", entries: [
    { id: "market-cap", term: "Market cap", def: "Price times the number of tokens in circulation." },
    { id: "fdv", term: "Fully diluted value (FDV)", def: "Price times every token that will ever exist, including ones not yet released. A big gap to market cap means more supply is coming." },
    { id: "fees", term: "Fees and revenue", def: "Fees are what users pay to use a network or app. Revenue is the part kept by the protocol or its token holders, after paying validators or liquidity providers." },
    { id: "price-to-fees", term: "Price-to-fees and price-to-revenue", def: "Market cap divided by a year's fees or revenue: crypto's version of a price-to-sales ratio. Lower means more usage per dollar of value." },
    { id: "tvl", term: "TVL (total value locked)", def: "The value of tokens deposited in a network's or app's smart contracts." },
    { id: "stablecoin", term: "Stablecoin", def: "A token designed to hold a fixed value, usually one US dollar, such as USDT or USDC." },
    { id: "memecoin", term: "Memecoin", def: "A token driven mainly by community and attention rather than usage. Most lose almost all their value." },
    { id: "trusted-setup", term: "Trusted setup", def: "A one-time ceremony some privacy systems need to create their keys. If the secret from it were kept instead of destroyed, it could be abused, so newer designs avoid it." },
  ] },
  { title: "Commodities", entries: [
    { id: "u3o8", term: "U3O8 (yellowcake)", def: "Uranium oxide concentrate, the form uranium is sold in after mining. Prices are quoted in US dollars per pound." },
    { id: "tu", term: "tU (tonnes of uranium)", def: "Uranium measured by the weight of uranium itself. One tonne of uranium is about 2,600 pounds of U3O8." },
    { id: "swu", term: "SWU (separative work unit)", def: "The unit of uranium enrichment capacity: the work needed to raise the share of uranium-235." },
    { id: "nav", term: "NAV, premium and discount", def: "A fund's net asset value is what its holdings are worth per unit. A unit price above that is a premium, below it a discount." },
  ] },
];

export const GLOSSARY_IDS = GLOSSARY.flatMap((g) => g.entries.map((e) => e.id));
