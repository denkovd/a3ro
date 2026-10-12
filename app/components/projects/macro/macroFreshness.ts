/** Snapshot age and source periods are separate: monthly releases can stay
 * unchanged while the daily computation is healthy. */
export function macroFreshness(
  snap: { computedAt: string | null; cycles: { key: string; asOf: string | null }[] },
  now = Date.now(),
): "current" | "stale" | "unknown" {
  const computed = snap.computedAt ? Date.parse(snap.computedAt) : NaN;
  if (!Number.isFinite(computed)) return "unknown";
  if (now - computed > 48 * 60 * 60 * 1000) return "stale";
  const axes = ["growth", "inflation"].map((key) => snap.cycles.find((c) => c.key === key)?.asOf);
  // Observation dates are month starts; allow publication lag as well.
  if (axes.some((date) => date && now - Date.parse(date) > 75 * 86_400_000)) return "stale";
  if (axes.some((date) => !date || !Number.isFinite(Date.parse(date)))) return "unknown";
  return "current";
}

export function formatMacroUpdated(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Update time unavailable";
  return `Updated ${date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  })} UTC`;
}

export function formatMacroPeriod(iso: string | null | undefined): string {
  const date = iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    : "unavailable";
}
