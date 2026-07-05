/* ────────────────────────────────────────────────────────────────
   Oil Tracker — pure formatting helpers
   No imports, no side effects. Shared by the client hook + core view.
──────────────────────────────────────────────────────────────── */

/** Formats a USD/bbl price to 2 decimals, e.g. "$63.41" or "-$37.63". */
export function formatUsdBbl(p: number): string {
  const sign = p < 0 ? "-" : "";
  return `${sign}$${Math.abs(p).toFixed(2)}`;
}

/** Formats a ratio (0.0124) as a signed percent string, e.g. "+1.24%" / "-0.87%". */
export function formatPctSigned(ratio: number): string {
  const sign = ratio < 0 ? "-" : "+";
  return `${sign}${Math.abs(ratio * 100).toFixed(2)}%`;
}

/** Formats an ISO timestamp as zero-padded 24h UTC time, e.g. "14:32 UTC". */
export function formatUtcTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jun 29 · 18:30 UTC" — date-aware timestamp for non-today instants. */
export function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  const month = SHORT_MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  return `${month} ${day} · ${formatUtcTime(iso)}`;
}

/** True when the ISO instant falls on today's UTC calendar date. */
export function isUtcToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}
