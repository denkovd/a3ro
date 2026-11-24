import { parseBtos, parseEci, parseIndeedSectors, readEpochArchive } from "./parsers";
import { FRED_SERIES, STATE_FIPS, droughtUrl, eiaRetailUrl, parseDataCentres, parseDroughtState, parseEiaRetail, parseFredPrices } from "../constraints/parsers";
import { STEP3_SOURCES, type DroughtPayload, type SignalDataset, type SignalPayload, type SignalSource } from "./types";

export const SIGNAL_URLS: Record<SignalSource, string> = {
  epoch: "https://epoch.ai/data/benchmark_data.zip",
  btos: "https://www.census.gov/hfp/btos/downloads/National.xlsx",
  indeed: "https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/US/job_postings_by_sector_US.csv",
  eia: "https://api.eia.gov/v2/electricity/retail-sales/",
  fred: "https://fred.stlouisfed.org/graph/fredgraph.csv",
  datacentres: "https://epoch.ai/data/data_centers/data_centers.csv",
  drought: "https://usdmdataservices.unl.edu/api/StateStatistics/GetDroughtSeverityStatisticsByAreaPercent",
};

const MAX_BYTES = 200_000_000;
const USER_AGENT = "Mozilla/5.0 (compatible; A3RO research; AI Dividend module)";

type Fetch = typeof fetch;

/** A network error ("fetch failed": reset, DNS, TLS) is often transient, so it gets one retry.
 *  HTTP errors are not retried: they say something about the request or the source. */
export const NETWORK_RETRY_DELAY_MS = 5_000;

async function download(url: string, fetchImpl: Fetch, label: string, accept?: string, retryDelayMs = NETWORK_RETRY_DELAY_MS): Promise<Uint8Array> {
  const request = () => fetchImpl(url, { headers: { "User-Agent": USER_AGENT, ...(accept ? { Accept: accept } : {}) }, signal: AbortSignal.timeout(90_000) });
  let response: Response;
  try { response = await request(); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    try { response = await request(); }
    catch (retryError) { throw new Error(`${label} network error after one retry: ${retryError instanceof Error ? retryError.message : String(retryError)}`); }
  }
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error(`${label} download exceeds the supported size`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${label} download exceeds the supported size`);
  return bytes;
}

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8");

async function fetchDrought(fetchImpl: Fetch, now: Date): Promise<DroughtPayload> {
  const start = new Date(now.getTime() - 42 * 86_400_000);
  const queue = Object.entries(STATE_FIPS);
  const states: DroughtPayload["states"] = [];
  const failures: string[] = [];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [state, fips] = item;
      try { states.push(parseDroughtState(state, JSON.parse(text(await download(droughtUrl(fips, start, now), fetchImpl, "USDM", "application/json"))))); }
      catch { failures.push(state); }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  // A few missing states is tolerable; most missing means the service changed.
  if (states.length < 40) throw new Error(`USDM returned data for only ${states.length} states`);
  return { states: states.sort((a, b) => a.state.localeCompare(b.state)) };
}

const PARSERS: { [S in SignalSource]: (fetchImpl: Fetch, now: Date) => Promise<SignalPayload[S]> } = {
  epoch: async fetchImpl => parseEci(readEpochArchive(await download(SIGNAL_URLS.epoch, fetchImpl, "Epoch"))),
  btos: async fetchImpl => parseBtos(await download(SIGNAL_URLS.btos, fetchImpl, "Census")),
  indeed: async fetchImpl => parseIndeedSectors(text(await download(SIGNAL_URLS.indeed, fetchImpl, "Indeed"))),
  eia: async (fetchImpl, now) => {
    const key = process.env.EIA_API_KEY?.trim();
    if (!key) throw new Error("EIA_API_KEY is not set");
    return parseEiaRetail(JSON.parse(text(await download(eiaRetailUrl(key, `${now.getUTCFullYear() - 11}-01`), fetchImpl, "EIA", "application/json"))));
  },
  fred: async (fetchImpl, now) => {
    const start = `${now.getUTCFullYear() - 11}-01-01`;
    const get = async (id: string) => parseFredPrices(text(await download(`${SIGNAL_URLS.fred}?id=${id}&cosd=${start}`, fetchImpl, "FRED")), id);
    return { series: { uranium: await get(FRED_SERIES.uranium), copper: await get(FRED_SERIES.copper) } };
  },
  datacentres: async fetchImpl => parseDataCentres(text(await download(SIGNAL_URLS.datacentres, fetchImpl, "Epoch data centres"))),
  drought: (fetchImpl, now) => fetchDrought(fetchImpl, now),
};

export async function fetchSignal<S extends SignalSource>(source: S, opts: { now?: Date; fetchImpl?: Fetch } = {}): Promise<SignalDataset<S>> {
  const now = opts.now ?? new Date();
  const payload = await PARSERS[source](opts.fetchImpl ?? fetch, now);
  return { source, retrievedAt: now.toISOString(), dataUrl: SIGNAL_URLS[source], payload } as SignalDataset<S>;
}

/** Each source is fetched independently so one outage never blocks the others. */
export async function fetchSignals(opts: { now?: Date; fetchImpl?: Fetch; sources?: SignalSource[] } = {}) {
  const sources = opts.sources ?? STEP3_SOURCES;
  const results = await Promise.allSettled(sources.map(source => fetchSignal(source, opts)));
  return results.map((result, index) => ({
    source: sources[index],
    dataset: result.status === "fulfilled" ? result.value : null,
    error: result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : "Unknown error").slice(0, 200) : null,
  }));
}
