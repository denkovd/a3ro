"use client";
/* ────────────────────────────────────────────────────────────────
   AlertsFeed (roadmap P8) — surfaces the recent fired alert_events the
   backend rules engine already writes each ingestion cycle. Reads
   /api/oil/alerts (optionally per benchmark). Honest states: an empty
   feed reads "No alerts fired — rules armed" (not an error), a failed
   fetch stays quiet. Free-tier daily threshold / percent-move alerts;
   intraday alerting is the PRO tier (Hobby cron is daily).
   Self-contained so it needs no export surface from OilTrackerCore.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

const AMBER = "#d4a157";
const PINK = "#a8496b";
const TEAL = "#5fc9a4";

type AlertView = {
  id: string;
  firedAt: string;
  benchmark: string | null;
  type: string | null;
  payload: Record<string, unknown>;
};
type FeedState = { status: "loading" | "live" | "empty" | "error"; alerts: AlertView[] };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** One-line, deterministic summary from the event payload. */
function summarize(a: AlertView): string {
  const p = a.payload ?? {};
  const bench = a.benchmark ?? str(p.benchmark) ?? "—";
  const type = a.type ?? str(p.type);
  switch (type) {
    case "level_cross": {
      const dir = str(p.direction) ?? "crossed";
      const level = num(p.level);
      const price = num(p.price);
      return `${bench} ${dir} $${level ?? "—"}${price !== null ? ` · $${price.toFixed(2)}` : ""}`;
    }
    case "pct_move": {
      const move = num(p.movePct);
      const thr = num(p.thresholdPct);
      const basis = str(p.basis) === "intraday" ? "intraday" : "daily";
      return `${bench} ${basis} move ${move !== null ? `${move > 0 ? "+" : ""}${move}%` : ""}${thr !== null ? ` (≥${thr}%)` : ""}`;
    }
    case "stale_benchmark": {
      const age = num(p.ageHours);
      return `${bench} feed stale${age !== null ? ` · ${age}h` : ""}`;
    }
    case "source_disagreement": {
      const spread = num(p.spreadPct);
      return `${bench} source disagreement${spread !== null ? ` · ${spread}%` : ""}`;
    }
    default:
      return `${bench} alert`;
  }
}

function dotColor(a: AlertView): string {
  const type = a.type ?? str(a.payload?.type);
  if (type === "stale_benchmark" || type === "source_disagreement") return PINK;
  if (type === "pct_move") {
    const m = num(a.payload?.movePct);
    return m !== null && m < 0 ? PINK : m !== null && m > 0 ? TEAL : AMBER;
  }
  return AMBER;
}

/** "2026-07-08T13:00:00Z" → "Jul 8" (UTC, deterministic). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function AlertsFeed({ benchmark, className = "" }: { benchmark?: string; className?: string }) {
  const [s, setS] = useState<FeedState>({ status: "loading", alerts: [] });

  useEffect(() => {
    let alive = true;
    const url = `/api/oil/alerts?limit=6${benchmark ? `&benchmark=${encodeURIComponent(benchmark)}` : ""}`;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!alive) return;
        if (!res.ok || typeof body.error === "string") {
          setS({ status: "error", alerts: [] });
          return;
        }
        const raw = Array.isArray(body.alerts) ? body.alerts : [];
        const alerts = raw.map((r) => {
          const o = r as Record<string, unknown>;
          return {
            id: String(o.id ?? Math.random()),
            firedAt: String(o.firedAt ?? ""),
            benchmark: str(o.benchmark),
            type: str(o.type),
            payload: (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<string, unknown>,
          };
        });
        setS({ status: alerts.length ? "live" : "empty", alerts });
      })
      .catch(() => {
        if (alive) setS({ status: "error", alerts: [] });
      });
    return () => {
      alive = false;
    };
  }, [benchmark]);

  if (s.status === "error") return null; // stay quiet on a failed fetch

  return (
    <div className={className}>
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
        Alerts · daily{benchmark ? ` · ${benchmark}` : ""}
      </p>
      {s.status === "loading" ? (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Loading…</p>
      ) : s.status === "empty" ? (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          No alerts fired — rules armed
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {s.alerts.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span aria-hidden className="mt-[3px] inline-block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: dotColor(a) }} />
              <span className="flex-1 text-[11px] leading-snug text-[var(--ink-2)]">{summarize(a)}</span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                {formatWhen(a.firedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
