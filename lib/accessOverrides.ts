// Owner access overrides (#52), read by middleware. Cached for 30s per server instance so a flip in
// Ops controls applies within half a minute without a redeploy. Any failure falls back to the last
// good copy, then to no overrides (the code defaults in lib/access.ts).
import type { AccessLevel, LevelOverrides } from "./access";

const TTL_MS = 30_000;
let cached: { at: number; levels: LevelOverrides } | null = null;

export async function loadLevelOverrides(): Promise<LevelOverrides> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.levels;
  try {
    const backend = await import("@a3ro/oil-backend");
    const settings = await backend.getModuleSettings(await backend.createDb());
    const levels: Record<string, AccessLevel> = {};
    for (const s of settings) if (s.level) levels[s.moduleId] = s.level;
    cached = { at: Date.now(), levels };
  } catch {
    cached = { at: Date.now(), levels: cached?.levels ?? {} };
  }
  return cached.levels;
}

/** Called after the owner saves a change, so this instance applies it immediately. */
export function clearLevelOverrides(): void {
  cached = null;
}
