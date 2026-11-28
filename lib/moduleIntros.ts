/* ────────────────────────────────────────────────────────────────
   Module intros for newcomers (roadmap #118).

   One place for the "what you're looking at and how to read it" panel
   at the top of each module and the one-line hint under each section
   heading, so the wording can be reviewed and edited without touching
   page code. Plain English, no jargon without a gloss. Australia Watch
   is the tester; other modules get an entry once it reads well.
──────────────────────────────────────────────────────────────── */

export interface ModuleIntro {
  /** 3–4 short lines. */
  lines: readonly string[];
  /** Methodology page for depth (#29); modules without one link the glossary. */
  methodology?: { href: string; label: string };
  /** One line under each section heading, keyed by the section's id (or, in globe sidebars, its label). */
  sections?: Readonly<Record<string, string>>;
}

export const MODULE_INTROS: Readonly<Record<string, ModuleIntro>> = {
  australia: {
    lines: [
      "This page tracks how Australia's economy is going, using official figures from the ABS, the RBA and the OECD. Each card updates when its source publishes.",
      "Every card shows the latest number and its history. The shaded band is that measure's usual range, so a line outside it is out of the ordinary.",
      "Cards are tagged leading (tends to turn first), coincident (moves with the economy) or lagging (confirms later). Watch the leading ones for early signs of a turn.",
      "The Australia Pulse box sums up which way the leading indicators and inflation are heading. It describes what the data shows; it isn't a forecast.",
    ],
    methodology: { href: "/methodology/australia-watch", label: "How Australia Watch works" },
    sections: {
      stress: "Signs that households and businesses are under strain: missed mortgage payments, company failures and power costs. For most of these, higher is worse; output per person is the exception.",
      inflation: "How fast prices and wages are rising. The RBA aims for 2–3% a year; trimmed mean leaves out the biggest price swings and is the RBA's preferred guide.",
      labour: "Whether there's enough work. Job vacancies and underemployment usually turn before the unemployment rate does.",
      financial: "The cost and flow of money: interest rates, what markets expect the RBA to do next, how much banks are lending, and the Australian dollar.",
      housing: "Building approvals and new home loans show where housing is heading; prices and rents show where it is now.",
      demand: "How much households are spending, the largest part of the economy.",
      external: "What the world pays for Australia's exports, and whether Australia sells more goods than it buys.",
      composite: "The OECD's summary gauges of where activity and confidence are heading over the next several months.",
    },
  },

  dividend: {
    lines: [
      "This page follows AI from rising capability to real-world results, as a chain of stages: is it lifting output, who gets the gains, and what physical limits (power, chips, materials) could slow it.",
      "Pick a stage in the numbered row to see its measures. Every figure comes from published data, with its source and date.",
      "The label under each stage says how much data it has so far: Live, Partial data, or the next step still to build. Stages without data say so instead of guessing.",
      "The Australia tab puts the same questions to Australia's figures.",
    ],
  },
  crypto: {
    lines: [
      "This page compares crypto networks and apps by how much people actually pay to use them, not by token price.",
      "Fees are what users paid over the last 30 days; revenue is the part the project keeps. Value locked is money parked in the network's apps; stablecoins are digital dollars held on it.",
      "The tabs move between the overall picture, the projects earning most from their users, and themes such as Solana, Bitcoin, privacy coins and real-world infrastructure.",
      "Figures come from DefiLlama and update daily. “How to read this” at the bottom has the full definitions.",
    ],
  },
  bull: {
    lines: [
      "This screener shows which markets are in an uptrend right now, across shares, ETFs, commodities, currencies and crypto, and how recently each trend turned.",
      "A trend turns up when the price closes above its recent trading range, and stays up until it closes below a rising floor called the Money Line. It's checked on daily and weekly prices.",
      "Double confirmed means up on both daily and weekly, the strongest reading. The freshest turns are at the top.",
      "It describes trends that already exist; it doesn't predict them. Select an asset for its chart and detail.",
    ],
    methodology: { href: "/methodology/bull-market-finder", label: "How Bull Market Finder works" },
  },
  "bull-macro": {
    lines: [
      "This screener shows which of 30 major markets (share indices, bonds, commodities, currencies and crypto) are in an uptrend, and how recently each turned.",
      "A trend turns up when the price closes above its recent trading range, and stays up until it closes below a rising floor called the Money Line.",
      "Double confirmed means up on both daily and weekly prices, the strongest reading. The freshest turns are at the top.",
      "It describes trends that already exist; it doesn't predict them.",
    ],
    methodology: { href: "/methodology/bull-market-finder", label: "How the trend rule works" },
  },
  earnings: {
    lines: [
      "This leaderboard ranks companies by how reliably they beat analysts' earnings forecasts.",
      "A beat is when reported earnings per share or revenue come in above what analysts expected. The score combines how big the beats were, how often they happen and how recent they are; recent quarters count most.",
      "The streak counts quarters in a row with a beat. The small marks show each recent quarter's result against forecasts.",
      "A strong record doesn't guarantee the next quarter, and a beat doesn't always move the share price.",
    ],
  },
  execute: {
    lines: [
      "This is a fixed-rules Bitcoin strategy around two scheduled US events: Federal Reserve rate decisions (FOMC) and inflation releases (CPI).",
      "When Bitcoin has moved unusually far in the week before an event, the strategy bets on that move partly reversing, entering 24 hours before the release. Most weeks there's no trade.",
      "Every trade is recorded as a paper trade, alongside a hypothetical backtest.",
      "It's research, not advice: trades are simulated, and leveraged crypto trading can lose more than you expect.",
    ],
    sections: {
      pivots: "The next Fed decisions and CPI releases, in Sydney time. A trade can only happen around these.",
      signal: "Whether the move into the next event is big enough to trade, measured against Bitcoin's own recent swings.",
      position: "The current simulated trade, if there is one.",
      record: "Every paper trade since tracking began, wins and losses, next to the hypothetical backtest.",
      rules: "The rules behind every trade. They're fixed, so results can't be tuned after the fact.",
    },
  },
  regime: {
    lines: [
      "This page places the US economy in one of four regimes, from whether growth and inflation are speeding up or slowing: Goldilocks (growth up, inflation down), Reflation (both up), Inflation (growth down, inflation up) and Deflation (both down).",
      "It then checks which regime markets are pricing, from how a wide set of markets is trending. When the economy and markets agree, the read is stronger.",
      "Further down are a suggested mix of assets, a risk matrix, liquidity and the cost of capital, all built from the same data.",
      "The economic regime changes only when new monthly figures arrive, so it lags the economy. It describes; it doesn't forecast.",
    ],
  },
  oil: {
    lines: [
      "The globe tracks the world's oil supply routes. The rings are shipping chokepoints such as Hormuz and Suez, sized by how far tanker traffic is from normal.",
      "Red means fewer tankers than usual, amber is a typical week, teal is more than usual, each judged against that strait's own history.",
      "The sidebar lists what's unusual first, then other routes, refineries (a status shows only when a source confirms it) and the WTI and Brent prices.",
      "Drag to turn the globe, scroll to zoom, and select anything for detail. Red cards flag current disruptions.",
    ],
  },
  gold: {
    lines: [
      "The globe maps where gold is mined, who holds it (central banks, gold funds and exchange vaults) and the main trading hubs.",
      "The sidebar shows the gold price and the latest reported changes in fund holdings and exchange stocks.",
      "Lines between hubs are illustrative routes, not tracked shipments.",
      "Drag to turn the globe, scroll to zoom, and select a mine, holder or hub for detail.",
    ],
  },
  btc: {
    lines: [
      "The globe shows where Bitcoin trades and is held: major exchanges, US spot Bitcoin funds (ETFs) and the regions where it's mined.",
      "“What changed” in the sidebar lists the latest moves, such as daily ETF flows. Reserve figures come from wallets the exchanges publish.",
      "Mining shares by country and the lines between venues are illustrative, not live measurements.",
      "Drag to turn the globe, scroll to zoom, and select a venue for detail.",
    ],
  },
  uranium: {
    lines: [
      "The globe follows nuclear fuel from mine to reactor: mining, conversion, enrichment, fuel fabrication, and the reactors that use it.",
      "The steps after mining happen in only a handful of countries, which is where supply can get tight.",
      "Figures are reference data, mostly from the World Nuclear Association, checked by hand with dates shown. They are not live.",
      "Drag to turn the globe, scroll to zoom, and select a site or country for detail.",
    ],
  },
  copper: {
    lines: [
      "The globe shows where copper is mined (mainly the Andes and Central Africa), where it's refined (mostly China) and where Australia's copper exports go.",
      "Bubbles are sized by output; arcs run to Australia's buyers, thicker for bigger ones. Red cards flag mines and smelters with current disruptions.",
      "The sidebar starts with the copper price and what it means for Australia's export earnings.",
      "Drag to turn the globe, scroll to zoom, and select anything for detail.",
    ],
    sections: {
      "COMEX warehouse stocks": "Copper held in US exchange warehouses, updated daily. Falling stocks can point to tighter supply.",
      "Australian exports": "What Australia earned from copper and where it went, from ABS trade data.",
      "Supply and demand": "How much copper the world mines and refines, and where it's used.",
      "Disruptions": "Major mines and smelters that are stopped or at risk.",
      "Outlook": "The Australian Government's forecast of copper export earnings.",
      "Australia": "Australia's place in world copper: reserves, output and where it's made into metal.",
    },
  },
  ironore: {
    lines: [
      "The globe shows who mines iron ore, who buys it (mainly China's steel mills) and where Australia's shipments go.",
      "Australia is the world's largest exporter, so the price matters for national income. The sidebar shows the price and what a move means for export earnings.",
      "Bubbles are sized by output or imports; arcs run to Australia's buyers, thicker for bigger ones.",
      "Drag to turn the globe, scroll to zoom, and select anything for detail.",
    ],
    sections: {
      "What it means for Australia": "How much a move in the iron ore price changes Australia's export earnings.",
      "Australian exports": "What Australia earned from iron ore and where it went, from ABS trade data.",
      "Supply and demand": "Who mines iron ore and who uses it to make steel.",
      "Outlook": "The Australian Government's forecast of iron ore export earnings.",
      "Australia": "Australia's place in world iron ore: reserves, output and the main mining regions.",
    },
  },
  lng: {
    lines: [
      "The globe shows who exports liquefied natural gas (LNG), who imports it, Australia's LNG plants and where their cargoes go.",
      "Shipping through the Strait of Hormuz has been restricted since February 2026, cutting off a large share of world supply; its red card has the latest.",
      "The sidebar starts with the LNG price paid in Japan, a key market for Australian gas, and what it means for export earnings.",
      "Drag to turn the globe, scroll to zoom, and select anything for detail.",
    ],
    sections: {
      "2026 shock": "The Hormuz restriction and what it has done to world LNG supply.",
      "Australian exports": "What Australia earned from LNG, from ABS trade data.",
      "Where it goes": "The buyers of Australia's LNG, largest first.",
      "World trade": "The biggest LNG exporters and importers worldwide.",
      "Outlook": "The Australian Government's forecast of LNG export earnings.",
      "Australia": "Australia's LNG plants, capacity and share of world exports.",
    },
  },
};
