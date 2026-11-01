export type AustraliaCapitalObservation = {
  asOf: string;
  priceEarnings: number;
  bondYield: number;
};

export type AustraliaCapitalSnapshot = AustraliaCapitalObservation & {
  version: number;
  checkedAt: string;
  bondAsOf: string;
  sources: { label: string; url: string }[];
};

function capitalCost(observation: AustraliaCapitalObservation) {
  if (!Number.isFinite(observation.priceEarnings) || observation.priceEarnings <= 0
    || !Number.isFinite(observation.bondYield)) {
    throw new Error("Australian cost of capital requires a positive P/E and a finite bond yield.");
  }
  return 100 / observation.priceEarnings + observation.bondYield;
}

/** Match the equity valuation month exactly; never substitute a newer bond yield. */
export function parseRbaBondCsv(csv: string, asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf))) {
    throw new Error("A valid ISO observation date is required.");
  }
  const rows = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  const columns = rows.find((row) => row[0] === "Series ID");
  const index = columns?.indexOf("FCMYGBAG10") ?? -1;
  if (index < 1) throw new Error("RBA 10-year government bond series FCMYGBAG10 is missing.");
  for (const row of rows) {
    if (!/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(row[0])) continue;
    const date = new Date(`${row[0]} 00:00:00 GMT`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 7) !== asOf.slice(0, 7)) continue;
    const cell = row[index];
    if (!cell || !Number.isFinite(Number(cell))) throw new Error(`RBA bond yield is missing for ${asOf.slice(0, 7)}.`);
    return { bondAsOf: date.toISOString().slice(0, 10), bondYield: Number(cell) };
  }
  throw new Error(`RBA has not published the matching bond yield for ${asOf.slice(0, 7)}.`);
}

export function calculateAustraliaCapital(
  snapshot: AustraliaCapitalSnapshot,
  observations: AustraliaCapitalObservation[],
) {
  if (snapshot.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf)
    || !Number.isFinite(Date.parse(snapshot.asOf)) || !Number.isFinite(Date.parse(snapshot.checkedAt))
    || snapshot.asOf.slice(0, 7) !== snapshot.bondAsOf.slice(0, 7)) {
    throw new Error("Australian valuation and bond inputs must have valid dates and cover the same month.");
  }
  if (!observations.length) throw new Error("Australian historical reference observations are missing.");
  const current = capitalCost(snapshot);
  // Average the historical yields themselves, rather than inverting an average P/E.
  const longRunMean = observations.reduce((sum, observation) => sum + capitalCost(observation), 0) / observations.length;
  return { current, longRunMean, gap: current - longRunMean };
}
