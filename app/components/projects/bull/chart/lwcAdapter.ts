"use client";
/* ────────────────────────────────────────────────────────────────
   Bull chart — the ONE place that knows lightweight-charts.
   ChartSignal[] in, chart series / markers / price lines out.
   Swapping the chart library = rewriting this file (and the thin
   chart setup in BullChart.tsx); signals and the backend don't move.

   Mapping:
   - line / step → one LineSeries per contiguous same-tone run, so a
     trend flip breaks the line instead of drawing a connector (lwc
     joins lines across whitespace, so gaps can't do this); explicit
     per-point colours → one series
   - markers     → one series-markers plugin on the price series
                   (all marker signals merged, sorted by time)
   - level       → price line on the price series (axis label = label)
   - band        → upper + lower lines (fill: future series primitive)
   - histogram   → HistogramSeries on its pane
──────────────────────────────────────────────────────────────── */
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  MouseEventParams,
  SeriesMarker,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { ChartSignal, LineStyleName, SignalPoint, SignalTone } from "./signals";

export type Lwc = typeof import("lightweight-charts");
export type Palette = Record<SignalTone, string>;

export type SignalHandles = {
  /** Show/hide by legend group. */
  setHidden: (hiddenGroups: Set<string>) => void;
  /** Value of each visible line-like signal at the crosshair. */
  readout: (param: MouseEventParams<Time>) => { id: string; label: string; value: number; color: string }[];
  dispose: () => void;
};

const lineStyle = (lwc: Lwc, s: LineStyleName) =>
  s === "dashed" ? lwc.LineStyle.Dashed : s === "dotted" ? lwc.LineStyle.Dotted : lwc.LineStyle.Solid;

const markerShape = { up: "arrowUp", down: "arrowDown", dot: "circle", square: "square" } as const;

type LineLike = { signal: ChartSignal; series: ISeriesApi<SeriesType, Time>[]; color: string };

export function renderSignals(
  lwc: Lwc,
  chart: IChartApi,
  price: ISeriesApi<"Candlestick", Time>,
  signals: ChartSignal[],
  palette: Palette,
): SignalHandles {
  const toneColor = (t: SignalTone | undefined, fallback: SignalTone = "neutral") => palette[t ?? fallback];
  const created: { signal: ChartSignal; series: ISeriesApi<SeriesType, Time>[]; lines: IPriceLine[] }[] = [];
  const lineLikes: LineLike[] = [];

  const lineSeries = (
    pane: number, pts: SignalPoint[], width: 1 | 2 | 3, styleName: LineStyleName, stepped: boolean,
  ): { series: ISeriesApi<SeriesType, Time>[]; color: string } => {
    const base = {
      lineWidth: width,
      lineStyle: lineStyle(lwc, styleName),
      lineType: stepped ? lwc.LineType.WithSteps : lwc.LineType.Simple,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    const explicit = pts.some((p) => p.color);
    if (explicit) {
      const s = chart.addSeries(lwc.LineSeries, { ...base, color: pts.find((p) => p.color)?.color }, pane);
      s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value, ...(p.color ? { color: p.color } : {}) })));
      return { series: [s], color: pts.at(-1)?.color ?? palette.neutral };
    }
    const runs: { tone: SignalTone; pts: SignalPoint[] }[] = [];
    for (const p of pts) {
      const t = p.tone ?? "neutral";
      const cur = runs.at(-1);
      if (cur && cur.tone === t) cur.pts.push(p);
      else runs.push({ tone: t, pts: [p] });
    }
    const series = runs.map((run) => {
      const s = chart.addSeries(lwc.LineSeries, { ...base, color: palette[run.tone] }, pane);
      s.setData(run.pts.map((p) => ({ time: p.time as Time, value: p.value })));
      return s;
    });
    return { series, color: toneColor(pts.at(-1)?.tone) };
  };

  for (const sig of signals) {
    switch (sig.kind) {
      case "line":
      case "step": {
        if (sig.points.length === 0) break;
        const { series, color } = lineSeries(sig.pane, sig.points, sig.width, sig.style, sig.kind === "step");
        created.push({ signal: sig, series, lines: [] });
        lineLikes.push({ signal: sig, series, color });
        break;
      }
      case "band": {
        const up = lineSeries(sig.pane, sig.upper.map((p) => ({ ...p, tone: p.tone ?? sig.tone })), 1, "solid", false);
        const lo = lineSeries(sig.pane, sig.lower.map((p) => ({ ...p, tone: p.tone ?? sig.tone })), 1, "solid", false);
        created.push({ signal: sig, series: [...up.series, ...lo.series], lines: [] });
        break;
      }
      case "histogram": {
        const s = chart.addSeries(lwc.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, sig.pane);
        s.setData(sig.points.map((p) => ({ time: p.time as Time, value: p.value, color: p.color ?? toneColor(p.tone) })));
        created.push({ signal: sig, series: [s], lines: [] });
        lineLikes.push({ signal: sig, series: [s], color: palette.neutral });
        break;
      }
      case "level": {
        const line = price.createPriceLine({
          price: sig.value,
          color: sig.color ?? toneColor(sig.tone),
          lineWidth: 1,
          lineStyle: lineStyle(lwc, sig.style),
          axisLabelVisible: true,
          title: sig.label,
        });
        created.push({ signal: sig, series: [], lines: [line] });
        break;
      }
      case "markers":
        created.push({ signal: sig, series: [], lines: [] });
        break;
    }
  }

  // Panes below the price pane stay compact.
  const panes = chart.panes();
  for (let i = 1; i < panes.length; i++) panes[i].setHeight(90);

  const markerSignals = signals.filter((s): s is Extract<ChartSignal, { kind: "markers" }> => s.kind === "markers");
  let markersApi: ISeriesMarkersPluginApi<Time> | null = null;
  const applyMarkers = (hidden: Set<string>) => {
    const all: SeriesMarker<Time>[] = markerSignals
      .filter((s) => !hidden.has(s.group))
      .flatMap((s) => s.points.map((p) => ({
        time: p.time as Time,
        position: p.position === "above" ? ("aboveBar" as const) : ("belowBar" as const),
        shape: markerShape[p.shape],
        color: p.color ?? toneColor(p.tone),
        text: p.text,
        size: 1,
      })))
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    if (!markersApi) markersApi = lwc.createSeriesMarkers(price, all);
    else markersApi.setMarkers(all);
  };
  applyMarkers(new Set(signals.filter((s) => s.hidden).map((s) => s.group)));

  let hiddenNow = new Set<string>();

  return {
    setHidden(hidden) {
      hiddenNow = hidden;
      for (const c of created) {
        const visible = !hidden.has(c.signal.group);
        for (const s of c.series) s.applyOptions({ visible });
        for (const l of c.lines) l.applyOptions({ lineVisible: visible, axisLabelVisible: visible });
      }
      applyMarkers(hidden);
    },
    readout(param) {
      const out: { id: string; label: string; value: number; color: string }[] = [];
      for (const l of lineLikes) {
        if (hiddenNow.has(l.signal.group)) continue;
        for (const s of l.series) {
          const d = param.seriesData.get(s) as { value?: number; color?: string } | undefined;
          if (d && typeof d.value === "number") {
            const opts = s.options() as { color?: string };
            out.push({ id: l.signal.id, label: l.signal.label, value: d.value, color: d.color ?? opts.color ?? l.color });
            break;
          }
        }
      }
      return out;
    },
    dispose() {
      markersApi?.detach();
      for (const c of created) {
        for (const l of c.lines) price.removePriceLine(l);
        for (const s of c.series) chart.removeSeries(s);
      }
    },
  };
}
