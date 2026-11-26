/* ────────────────────────────────────────────────────────────────
   Execute — pure helpers: Sydney-time labels, countdowns and the
   newsletter block ("Execute this week"). No IO, clock passed in.

   Newsletter rules (docs/execute-module-plan.md §4):
     · only when an FOMC/CPI event falls in the next 7 days
     · free:    dates + Sydney times only
     · premium: + current z and lean, what would arm it, last forward trade
──────────────────────────────────────────────────────────────── */
import { EXECUTE_STRATEGY_VERSION, EXECUTE_Z_THRESHOLD, type ExecuteNewsletterBlock, type ExecuteTrade, type ExecuteUpcoming } from "./types";

export const SYDNEY = "Australia/Sydney";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function sydneyLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  }).format(new Date(iso));
}

export function countdown(targetIso: string, now: Date): string {
  const ms = Date.parse(targetIso) - now.getTime();
  if (ms <= 0) return "now";
  const d = Math.floor(ms / DAY_MS);
  const h = Math.floor((ms - d * DAY_MS) / HOUR_MS);
  const m = Math.floor((ms - d * DAY_MS - h * HOUR_MS) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ago(pastIso: string, now: Date): string {
  const ms = now.getTime() - Date.parse(pastIso);
  if (ms < 60_000) return "just now";
  const h = Math.floor(ms / HOUR_MS);
  return h >= 48 ? `${Math.floor(h / 24)}d ago` : h >= 1 ? `${h}h ago` : `${Math.floor(ms / 60_000)}m ago`;
}

export function leanWord(lean: string): string {
  return lean === "short" ? "fade the rally (short)" : lean === "long" ? "fade the sell-off (long)" : "no lean";
}

export function formatZ(z: number | null): string {
  return z == null ? "—" : `${z >= 0 ? "+" : ""}${z.toFixed(2)}`;
}

export function formatPct(x: number | null, digits = 1): string {
  return x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`;
}

function whatArms(item: ExecuteUpcoming): string {
  const s = item.signal;
  if (s?.state === "armed") {
    return s.lean === "none"
      ? "Armed with no lean: the run-in was too small, so no trade was taken."
      : `Armed ${s.lean.toUpperCase()} at z ${formatZ(s.z)}.`;
  }
  return `Arms ${sydneyLabel(item.armTime)} (24h before). A trade needs BTC's 7-day move to be at least ${EXECUTE_Z_THRESHOLD}× its normal swing either way (|z| ≥ ${EXECUTE_Z_THRESHOLD}); it then fades the move.`;
}

function lastTradeLine(trades: ExecuteTrade[]): string {
  const last = trades.filter(t => t.status === "closed").sort((a, b) => Date.parse(b.closedAt ?? b.eventTime) - Date.parse(a.closedAt ?? a.eventTime))[0];
  if (!last) return "Forward paper record: no closed trades yet.";
  return `Last forward paper trade: ${last.eventKind} ${new Date(last.eventTime).toISOString().slice(0, 10)}, ${last.side}, ${formatPct(last.pnlPct, 2)} of equity.`;
}

export function buildExecuteNewsletter(upcoming: ExecuteUpcoming[], paperTrades: ExecuteTrade[], now: Date): ExecuteNewsletterBlock | null {
  const week = upcoming.filter(e => {
    const t = Date.parse(e.eventTime);
    return t > now.getTime() && t <= now.getTime() + 7 * DAY_MS;
  });
  if (!week.length) return null;
  const head = "EXECUTE THIS WEEK — BTC event pivots";
  const free = [head, ...week.map(e => `• ${e.kind}: ${sydneyLabel(e.eventTime)}`), "Leans and the track record are in A3RO Premium."].join("\n");
  const premium = [
    head,
    ...week.flatMap(e => {
      const s = e.signal;
      return [
        `• ${e.kind}: ${sydneyLabel(e.eventTime)}`,
        `  Now: 7-day move ${formatPct(s?.move7dPct ?? null)}, z ${formatZ(s?.z ?? null)} → ${leanWord(s?.lean ?? "none")}.`,
        `  ${whatArms(e)}`,
      ];
    }),
    lastTradeLine(paperTrades),
    `Strategy ${EXECUTE_STRATEGY_VERSION}. Educational research tracker and general information only, not financial advice. Hypothetical backtests and paper trades are not real results.`,
  ].join("\n");
  return { free, premium };
}
