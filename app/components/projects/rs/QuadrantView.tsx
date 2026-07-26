"use client";
/* ────────────────────────────────────────────────────────────────
   RRG-style quadrant view.

   x = rs63 (benchmark-relative, from the API) · y = change in rs63
   since the previous scan this browser has recorded locally. A
   symbol only gets a trail once local scan history holds 2+ dated
   readings for it — otherwise it renders as a single dot. Nothing
   here is backfilled or estimated; per spec, trails are never
   fabricated.
──────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import {
  BULL_VERDICT_META,
  TIER_LABEL,
  TIER_ORDER,
  type BullRow,
  type BullTier,
  type BullVerdict,
} from "../bull/bullData";
import { formatRs, quadrantSeriesForRow, type QuadrantSeries } from "./rsData";
import { scanDepth, useScanHistory } from "./rsHistory";

type TabKey = "all" | BullTier;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  ...TIER_ORDER.map((t) => ({ key: t as TabKey, label: TIER_LABEL[t] })),
];

const LEGEND: BullVerdict[] = ["BULLISH", "CONFLICT_DAILY", "CONFLICT_WEEKLY", "BEARISH", "WARMUP"];

const W = 640;
const H = 420;
const PAD = 34;

function scale(domainMax: number, value: number, size: number): number {
  const t = (value + domainMax) / (2 * domainMax);
  return Math.min(size, Math.max(0, t * size));
}

export default function QuadrantView({ rows, runDate }: { rows: BullRow[]; runDate: string | null }) {
  const history = useScanHistory(rows, runDate);
  const [tab, setTab] = useState<TabKey>("all");
  const [hoverSymbol, setHoverSymbol] = useState<string | null>(null);

  const displayRows = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.tier === tab)), [rows, tab]);

  const series = useMemo(
    () =>
      displayRows
        .map((r) => quadrantSeriesForRow(r, history[r.symbol]))
        .filter((s): s is QuadrantSeries => s.points.length > 0),
    [displayRows, history],
  );

  const { domX, domY } = useMemo(() => {
    let maxX = 5;
    let maxY = 5;
    for (const s of series) {
      for (const p of s.points) {
        maxX = Math.max(maxX, Math.abs(p.x));
        maxY = Math.max(maxY, Math.abs(p.y));
      }
    }
    return { domX: Math.ceil(maxX * 1.1), domY: Math.ceil(maxY * 1.1) };
  }, [series]);

  const px = (x: number) => PAD + scale(domX, x, W - PAD * 2);
  const py = (y: number) => H - PAD - scale(domY, y, H - PAD * 2);

  const depth = scanDepth(history);
  const hovered = series.find((s) => s.row.symbol === hoverSymbol) ?? null;

  if (rows.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={active}
              className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
              style={{
                color: active ? "var(--ink)" : "var(--ink-3)",
                background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {LEGEND.map((v) => (
          <p key={v} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
            <span aria-hidden className="h-[6px] w-[6px] rounded-full" style={{ background: BULL_VERDICT_META[v].color }} />
            {BULL_VERDICT_META[v].short}
          </p>
        ))}
      </div>

      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[26rem] w-full" role="img" aria-label="RRG-style relative strength quadrant">
          <line x1={PAD} y1={py(0)} x2={W - PAD} y2={py(0)} stroke="var(--line)" strokeWidth={1} />
          <line x1={px(0)} y1={PAD} x2={px(0)} y2={H - PAD} stroke="var(--line)" strokeWidth={1} />

          <text x={W - PAD - 4} y={PAD + 12} textAnchor="end" fill="var(--ink-3)" style={{ fontSize: 9, letterSpacing: 1 }}>
            LEADING
          </text>
          <text x={PAD + 4} y={PAD + 12} textAnchor="start" fill="var(--ink-3)" style={{ fontSize: 9, letterSpacing: 1 }}>
            IMPROVING
          </text>
          <text x={PAD + 4} y={H - PAD - 6} textAnchor="start" fill="var(--ink-3)" style={{ fontSize: 9, letterSpacing: 1 }}>
            LAGGING
          </text>
          <text x={W - PAD - 4} y={H - PAD - 6} textAnchor="end" fill="var(--ink-3)" style={{ fontSize: 9, letterSpacing: 1 }}>
            WEAKENING
          </text>

          {series.map((s) => {
            const color = BULL_VERDICT_META[s.row.verdict].color;
            const pts = s.points;
            const last = pts[pts.length - 1];
            const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x)},${py(p.y)}`).join(" ");
            return (
              <g key={s.row.symbol}>
                {pts.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth={1} opacity={0.35} />}
                {pts.slice(0, -1).map((p, i) => (
                  <circle
                    key={i}
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={2}
                    fill={color}
                    opacity={0.25 + (i / Math.max(1, pts.length - 1)) * 0.3}
                  />
                ))}
                <circle
                  cx={px(last.x)}
                  cy={py(last.y)}
                  r={hoverSymbol === s.row.symbol ? 5.5 : 4}
                  fill={color}
                  stroke="var(--depth-0)"
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverSymbol(s.row.symbol)}
                  onMouseLeave={() => setHoverSymbol((cur) => (cur === s.row.symbol ? null : cur))}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-sm hairline bg-[var(--depth-2)] px-2.5 py-1.5"
            style={{
              left: `${(px(hovered.points[hovered.points.length - 1].x) / W) * 100}%`,
              top: `${(py(hovered.points[hovered.points.length - 1].y) / H) * 100}%`,
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
              {hovered.row.displayName}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              RS63 {formatRs(hovered.points[hovered.points.length - 1].x)} · Δ{" "}
              {formatRs(hovered.points[hovered.points.length - 1].y)}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-[var(--ink-3)]">
        x = RS 63d (benchmark-relative) · y = change in RS 63d since the previous
        locally-recorded scan. Trails draw only once this browser has observed 2+
        scans for a symbol — {depth} distinct scan date{depth === 1 ? "" : "s"}{" "}
        recorded here so far, so most points are still single dots.
      </p>
    </div>
  );
}
