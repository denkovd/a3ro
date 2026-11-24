// Premium lookups for middleware and server pages. Cached per account for 30s per server instance,
// so a checkbox change on /owner/users applies within half a minute everywhere (at once on the
// instance that made it). Any failure counts as no Premium: the gate fails closed.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; premium: boolean }>();

export async function accountHasPremium(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.premium;
  try {
    const backend = await import("@a3ro/oil-backend");
    const premium = await backend.hasPremium(await backend.createDb(), userId);
    cache.set(userId, { at: Date.now(), premium });
    if (cache.size > 5_000) cache.delete(cache.keys().next().value as string);
    return premium;
  } catch {
    return false;
  }
}

export function clearPremiumCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
