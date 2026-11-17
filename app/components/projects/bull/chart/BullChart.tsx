"use client";
/* ────────────────────────────────────────────────────────────────
   Bull chart — candles + signal overlays for the asset drawer.

   lightweight-charts is imported lazily (only when a drawer opens),
   so it never weighs on the table page. Data = useBullChart (bars +
   ChartSignal[]); drawing = lwcAdapter.renderSignals. The legend is
   generated from the signals' groups, so any signal the backend adds
   — Money Line today, custom signals later — gets a toggle for free.
──────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from "lightweight-charts";
import { BULL_ACCENT, BULL_MUTED_AMBER, formatDate, formatPrice } from "../bullData";
import { renderSignals, type Lwc, type Palette, type SignalHandles } from "./lwcAdapter";
import { CHART_RANGES, useBullChart, type ChartRange, type ChartSignal } from "./signals";

const PALETTE: Palette = {
  bull: BULL_ACCENT,
  bear: "#c25a80", // BULL_MUTED_PINK lifted a step so a 1–2px line reads on the dark ground
  neutral: "#9ba39e",
  accent: BULL_MUTED_AMBER,
};

const RANGE_LABEL: Record<ChartRange, string> = {
  "3m": "3M", "6m": "6M", "1y": "1Y", "2y": "2Y", "5y": "5Y", max: "Max",
};

type Hover = {
  time: string;
  bar: { open: number; high: number; low: number; close: number } | null;
  lines: { id: string; label: string; value: number; color: string }[];
};

/** Legend entries: one per group, coloured by its most recent tone. */
function legendOf(signals: ChartSignal[]) {
  const groups = new Map<string, { group: string; color: string; dashed: boolean }>();
  for (const s of signals) {
    if (groups.has(s.group)) continue;
    let tone: string | undefined;
    let dashed = false;
    if (s.kind === "line" || s.kind === "step") { tone = s.points.at(-1)?.tone; dashed = s.style !== "solid"; }
    else if (s.kind === "level") { tone = s.tone; dashed = s.style !== "solid"; }
    else if (s.kind === "markers") tone = s.points.at(-1)?.tone;
    groups.set(s.group, { group: s.group, color: PALETTE[(tone as keyof Palette) ?? "neutral"] ?? PALETTE.neutral, dashed });
  }
  return Array.from(groups.values());
}

export default function BullChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<ChartRange>("1y");
  const data = useBullChart(symbol, range);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<Hover | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const lwcRef = useRef<Lwc | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const handlesRef = useRef<SignalHandles | null>(null);

  // Create the chart once (lazy library load).
  useEffect(() => {
    let alive = true;
    let chart: IChartApi | null = null;
    import("lightweight-charts")
      .then((lwc) => {
        if (!alive || !box.current) return;
        lwcRef.current = lwc;
        chart = lwc.createChart(box.current, {
          autoSize: true,
          layout: {
            background: { type: lwc.ColorType.Solid, color: "transparent" },
            textColor: "#5c6560",
            fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace",
            fontSize: 10,
            attributionLogo: true, // required by the Apache-2.0 licence notice
            panes: { separatorColor: "rgba(232,235,232,0.08)" },
          },
          grid: {
            vertLines: { color: "rgba(232,235,232,0.035)" },
            horzLines: { color: "rgba(232,235,232,0.035)" },
          },
          rightPriceScale: { borderColor: "rgba(232,235,232,0.08)", scaleMargins: { top: 0.1, bottom: 0.08 } },
          timeScale: { borderColor: "rgba(232,235,232,0.08)", rightOffset: 3, fixLeftEdge: true },
          crosshair: {
            mode: lwc.CrosshairMode.Normal,
            vertLine: { color: "rgba(232,235,232,0.2)", labelBackgroundColor: "#171b1a" },
            horzLine: { color: "rgba(232,235,232,0.2)", labelBackgroundColor: "#171b1a" },
          },
          localization: { priceFormatter: (p: number) => formatPrice(p) },
        });
        candlesRef.current = chart.addSeries(lwc.CandlestickSeries, {
          upColor: "#8f9893",
          downColor: "#2c3230",
          borderUpColor: "#8f9893",
          borderDownColor: "#6b736f",
          wickUpColor: "#6b736f",
          wickDownColor: "#6b736f",
          priceLineVisible: false,
        });
        chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
          if (!param.time || !param.point || !candlesRef.current) { setHover(null); return; }
          const bar = param.seriesData.get(candlesRef.current) as Hover["bar"] | undefined;
          setHover({
            time: String(param.time),
            bar: bar && "open" in bar ? bar : null,
            lines: handlesRef.current?.readout(param) ?? [],
          });
        });
        chartRef.current = chart;
        setReady(true);
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => {
      alive = false;
      handlesRef.current = null;
      chart?.remove();
      chartRef.current = null;
      candlesRef.current = null;
    };
  }, []);

  // Draw data + signals whenever a new payload lands.
  useEffect(() => {
    const lwc = lwcRef.current, chart = chartRef.current, candles = candlesRef.current;
    if (!ready || !lwc || !chart || !candles || data.status !== "live") return;
    handlesRef.current?.dispose();
    candles.setData(data.bars.map((b) => ({ ...b, time: b.time as Time })));
    handlesRef.current = renderSignals(lwc, chart, candles, data.signals, PALETTE);
    handlesRef.current.setHidden(hidden);
    chart.timeScale().fitContent();
    // `hidden` is applied by its own effect below; re-drawing on every
    // toggle would reset the user's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data]);

  useEffect(() => { handlesRef.current?.setHidden(hidden); }, [hidden]);

  // Groups that ship hidden start hidden (once per group name).
  const seenGroups = useRef(new Set<string>());
  useEffect(() => {
    const add = data.signals.filter((s) => s.hidden && !seenGroups.current.has(s.group)).map((s) => s.group);
    data.signals.forEach((s) => seenGroups.current.add(s.group));
    if (add.length > 0) setHidden((h) => new Set([...h, ...add]));
  }, [data.signals]);

  const legend = useMemo(() => legendOf(data.signals), [data.signals]);
  const last = data.bars.at(-1) ?? null;
  const shown = hover ?? (last ? { time: last.time, bar: last, lines: [] } : null);
  // While a new range loads, keep the previous chart on screen.
  const showOverlay = loadError || (data.status !== "live" && !(data.status === "loading" && data.bars.length > 0));

  return (
    <div>
      {/* range + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="group" aria-label="Chart range">
          {CHART_RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={active}
                className="rounded-[2px] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors duration-[var(--dur-micro)]"
                style={{
                  color: active ? BULL_ACCENT : "var(--ink-3)",
                  background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                  border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
                }}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((g) => {
            const off = hidden.has(g.group);
            return (
              <button
                key={g.group}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(g.group)) n.delete(g.group); else n.add(g.group);
                    return n;
                  })
                }
                className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] transition-opacity duration-[var(--dur-micro)]"
                style={{ color: "var(--ink-2)", opacity: off ? 0.35 : 1 }}
              >
                <span
                  aria-hidden
                  className="inline-block w-3"
                  style={{ borderTop: `2px ${g.dashed ? "dashed" : "solid"} ${g.color}` }}
                />
                {g.group}
              </button>
            );
          })}
        </div>
      </div>

      {/* crosshair readout */}
      <div className="mt-3 flex min-h-[1.25rem] flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
        {shown && (
          <>
            <span className="text-[var(--ink-2)]">{formatDate(shown.time)} {shown.time.slice(0, 4)}</span>
            {shown.bar && (
              <span>
                O {formatPrice(shown.bar.open)} · H {formatPrice(shown.bar.high)} · L {formatPrice(shown.bar.low)} ·{" "}
                <span className="text-[var(--ink)]">C {formatPrice(shown.bar.close)}</span>
              </span>
            )}
            {shown.lines.map((l) => (
              <span key={l.id} style={{ color: l.color }}>
                {l.label.replace("Money Line · ", "ML ")} {formatPrice(l.value)}
              </span>
            ))}
          </>
        )}
      </div>

      {/* chart */}
      <div className="relative mt-2 h-[320px] w-full">
        <div ref={box} className="absolute inset-0" />
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(11,13,13,0.6)" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              {loadError
                ? "Chart library failed to load"
                : data.status === "loading"
                  ? "Loading chart…"
                  : data.status === "empty"
                    ? "No price history stored for this asset yet"
                    : data.errorMessage ?? "Chart unavailable"}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
        Closed daily bars as the scan saw them{data.runDate ? ` (scan ${formatDate(data.runDate)})` : ""}. Lines are the
        Money Line flip levels, coloured by trend; arrows mark confirmed flips (D daily, W weekly). Scroll to zoom, drag
        to pan. Futures are roll-adjusted.
      </p>
    </div>
  );
}
