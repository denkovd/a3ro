import type { HorizonIndicator, HorizonSource } from "./types";

export const HORIZON_SOURCES: HorizonSource[] = ["bls", "bea", "dfa"];

export const HORIZON_INDICATORS: HorizonIndicator[] = [
  {
    key: "productivity", title: "Output per hour", area: "capacity", source: "bls", sourceSeries: "PRS85006093",
    frequency: "quarterly", unit: "index", adjustment: "Seasonally adjusted", population: "US nonfarm business sector, all workers",
    basis: "Real output per hour; source index", change: "percent", sourceUrl: "https://www.bls.gov/productivity/",
    note: "Economy-wide productive efficiency. This measure does not isolate the contribution of AI.",
  },
  {
    key: "real_compensation", title: "Real hourly compensation", area: "households", source: "bls", sourceSeries: "PRS85006153",
    frequency: "quarterly", unit: "index", adjustment: "Seasonally adjusted", population: "US nonfarm business sector, all workers",
    basis: "Compensation deflated by consumer prices; source index", change: "percent", sourceUrl: "https://www.bls.gov/productivity/",
    note: "Includes benefits and is an average. Its consumer-price deflator differs from the output-price concept used for productivity.",
  },
  {
    key: "unemployment", title: "Unemployment rate", area: "households", source: "bls", sourceSeries: "LNS14000000",
    frequency: "monthly", unit: "percent", adjustment: "Seasonally adjusted", population: "US civilian labour force, age 16 and over",
    basis: "Percent of the labour force", change: "percentage_points", sourceUrl: "https://www.bls.gov/cps/",
    note: "A national employment measure; it does not identify displacement caused by AI or capture all underemployment.",
  },
  {
    key: "electricity_prices", title: "Household electricity prices", area: "energy", source: "bls", sourceSeries: "CUSR0000SEHF01",
    frequency: "monthly", unit: "index", adjustment: "Seasonally adjusted", population: "US urban consumers, electricity component of CPI-U",
    basis: "Nominal consumer-price index", change: "percent", sourceUrl: "https://www.bls.gov/cpi/",
    note: "Measures household price pressure. It does not measure regional grid adequacy, wholesale power prices or industrial tariffs.",
  },
  {
    key: "real_median_dpi", title: "Real median disposable income", area: "households", source: "bea", sourceSeries: "DPI · Median ($2017)",
    frequency: "annual", unit: "usd2017", adjustment: "Not seasonally adjusted", population: "US households; ranked by equivalized disposable personal income",
    basis: "BEA median disposable personal income, 2017 dollars", change: "percent", sourceUrl: "https://www.bea.gov/data/special-topics/distribution-of-personal-income",
    note: "National-accounts income can include noncash items. This is not a cash budget or spending room after essentials. Annual estimates may be provisional.",
  },
  ...([
    ["income_bottom40", "Bottom 40% income share", "Lowest 40%"],
    ["income_middle40", "Middle 40% income share", "40th–80th percentiles"],
    ["income_top20", "Top 20% income share", "Highest 20%"],
  ] as const).map(([key, title, group]): HorizonIndicator => ({
    key, title, area: "households", source: "bea", sourceSeries: "DPI distribution · " + group,
    frequency: "annual", unit: "percent", adjustment: "Not seasonally adjusted", population: `US households, ${group}; ranked by equivalized disposable personal income`,
    basis: "Share of aggregate disposable personal income", change: "percentage_points", sourceUrl: "https://www.bea.gov/data/special-topics/distribution-of-personal-income",
    note: "Derived by adding non-overlapping published quintile shares. Measures income distribution, not real income growth within the group. Ranks do not track the same households over time.",
  })),
  ...([
    ["wealth_top1", "Top 1% wealth share", "Top 1%"],
    ["wealth_bottom50", "Bottom 50% wealth share", "Bottom 50%"],
  ] as const).map(([key, title, group]): HorizonIndicator => ({
    key, title, area: "ownership", source: "dfa", sourceSeries: "DFA net worth · " + group,
    frequency: "quarterly", unit: "percent", adjustment: "Not seasonally adjusted", population: `US households, ${group} by net worth`,
    basis: "Share of aggregate household net worth", change: "percentage_points", sourceUrl: "https://www.federalreserve.gov/releases/z1/dataviz/dfa/",
    note: "Official quarterly distribution estimates derived from financial accounts and household surveys. Wealth groups differ from income groups; net worth is not spendable income.",
  })),
];
