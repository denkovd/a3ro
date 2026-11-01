import { readFile, writeFile, rename } from "node:fs/promises";
import { parseArgs } from "node:util";
import { calculateAustraliaCapital, parseRbaBondCsv } from "../lib/australiaCapital.ts";

// MSCI's public profile can require browser access. Supply the P/E and its
// observation date only after verifying them on the primary-source page.
const { values } = parseArgs({ options: { "as-of": { type: "string" }, pe: { type: "string" } } });
if (!values["as-of"] || !values.pe || !(Number(values.pe) > 0) || !Number.isFinite(Number(values.pe))) {
  throw new Error("Usage: npm run refresh:australia-capital -- --as-of YYYY-MM-DD --pe VERIFIED_TRAILING_PE");
}
const asOf = values["as-of"];
if (asOf > new Date().toISOString().slice(0, 10)) throw new Error("Future observations cannot be published.");
const source = "https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv";
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`RBA request failed: ${response.status}`);
const bond = parseRbaBondCsv(await response.text(), asOf);
const output = new URL("../public/data/australia-cost-of-capital.json", import.meta.url);
const previous = JSON.parse(await readFile(output, "utf8"));
if (asOf < previous.asOf) throw new Error("Refusing to replace a newer observation with older data.");
const baseline = JSON.parse(await readFile(new URL("../lib/data/australia-capital-baseline.json", import.meta.url), "utf8"));
const snapshot = {
  version: 1, asOf, checkedAt: new Date().toISOString(),
  priceEarnings: Number(values.pe), ...bond,
  sources: [
    { label: "MSCI Australia Index — trailing P/E", url: "https://www.msci.com/indexes/index/903600/msci-australia-index" },
    { label: "RBA F2.1 — 10-year Australian government bond yield (monthly average)", url: source },
  ],
};
const result = calculateAustraliaCapital(snapshot, baseline.observations);
const temporary = new URL(`${output.href}.tmp`);
await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
await rename(temporary, output);
console.log(JSON.stringify({ asOf, ...result, baselineObservations: baseline.observations.length }, null, 2));
