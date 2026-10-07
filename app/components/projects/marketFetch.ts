/** Browser-only sharing for public market snapshots. Never cache account data. */
const PUBLIC_SNAPSHOTS = new Set([
  "/api/bull/latest", "/api/bull/transitions", "/api/regime/latest",
  "/api/macro/latest", "/api/leaderboard/earnings-beats",
  "/api/australia-watch/latest", "/api/gold/latest", "/api/btc/latest",
]);

type Entry = { response: Promise<Response>; expiresAt: number };
const snapshots = new Map<string, Entry>();
const MAX_ENTRIES = 64;

/** Each consumer gets its own body; failures are evicted so a retry can recover. */
export async function fetchMarketSnapshot(url: string): Promise<Response> {
  if (typeof window === "undefined" || !PUBLIC_SNAPSHOTS.has(url.split("?")[0])) {
    return fetch(url, { cache: "no-store" });
  }

  const now = Date.now();
  for (const [key, entry] of snapshots) {
    if (entry.expiresAt <= now) snapshots.delete(key);
  }
  const cached = snapshots.get(url);
  if (cached) return (await cached.response).clone();

  // Bound memory even when visitors switch through many strategy/filter values.
  if (snapshots.size >= MAX_ENTRIES) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
  const entry: Entry = { expiresAt: Infinity, response: fetch(url, { cache: "no-store" }).then((response) => {
    if (response.ok) entry.expiresAt = Date.now() + 15_000;
    else if (snapshots.get(url) === entry) snapshots.delete(url);
    return response;
  }).catch((error: unknown) => {
    if (snapshots.get(url) === entry) snapshots.delete(url);
    throw error;
  }) };
  snapshots.set(url, entry);
  return (await entry.response).clone();
}
