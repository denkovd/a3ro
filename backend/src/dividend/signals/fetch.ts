import { parseBtos, parseEci, parseIndeedSectors, readEpochArchive } from "./parsers";
import { SIGNAL_SOURCES, type SignalDataset, type SignalSource } from "./types";

export const SIGNAL_URLS: Record<SignalSource, string> = {
  epoch: "https://epoch.ai/data/benchmark_data.zip",
  btos: "https://www.census.gov/hfp/btos/downloads/National.xlsx",
  indeed: "https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master/US/job_postings_by_sector_US.csv",
};

const MAX_BYTES: Record<SignalSource, number> = { epoch: 200_000_000, btos: 20_000_000, indeed: 60_000_000 };
const USER_AGENT = "Mozilla/5.0 (compatible; A3RO research; AI Dividend module)";

export async function fetchSignal<S extends SignalSource>(source: S, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<SignalDataset<S>> {
  const dataUrl = SIGNAL_URLS[source];
  const response = await (opts.fetchImpl ?? fetch)(dataUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${source} returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES[source]) throw new Error(`${source} download exceeds the supported size`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES[source]) throw new Error(`${source} download exceeds the supported size`);
  const payload = source === "epoch" ? parseEci(readEpochArchive(bytes))
    : source === "btos" ? parseBtos(bytes)
    : parseIndeedSectors(Buffer.from(bytes).toString("utf8"));
  return { source, retrievedAt: (opts.now ?? new Date()).toISOString(), dataUrl, payload } as SignalDataset<S>;
}

/** Each source is fetched independently so one outage never blocks the others. */
export async function fetchSignals(opts: { now?: Date; fetchImpl?: typeof fetch; sources?: SignalSource[] } = {}) {
  const sources = opts.sources ?? SIGNAL_SOURCES;
  const results = await Promise.allSettled(sources.map(source => fetchSignal(source, opts)));
  return results.map((result, index) => ({
    source: sources[index],
    dataset: result.status === "fulfilled" ? result.value : null,
    error: result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : "Unknown error").slice(0, 200) : null,
  }));
}
