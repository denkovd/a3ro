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
  /** Methodology page for depth (#29). */
  methodology: { href: string; label: string };
  /** One line under each section heading, keyed by the section's id. */
  sections: Readonly<Record<string, string>>;
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
};
