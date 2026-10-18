"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HorizonPoint } from "../../../../backend/src/horizon/types";

export interface HorizonChartSeries {
  key: string;
  label: string;
  color: string;
  points: HorizonPoint[];
}

export default function HorizonChart({ series, unit, indexed = false, projection = false }: { series: HorizonChartSeries[]; unit: string; indexed?: boolean; projection?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const chart = useMemo(() => {
    const available = series.filter(item => item.points.length > 0);
    if (available.length !== series.length || !available.length) return null;
    const maps = available.map(item => new Map(item.points.map(point => [point.period, point.value])));
    const periods = available[0].points.map(point => point.period).filter(period => maps.every(values => values.has(period)));
    if (periods.length < 2) return null;
    const values = periods.map(period => ({ period, time: Date.UTC(Number(period.slice(0, 4)), period.includes("Q") ? (Number(period.slice(-1)) - 1) * 3 : period.length === 7 ? Number(period.slice(-2)) - 1 : 0, 1), values: maps.map(values => indexed ? values.get(period)! / values.get(periods[0])! * 100 : values.get(period)!) }));
    if (indexed && maps.some(values => values.get(periods[0])! <= 0)) return null;
    const all = values.flatMap(point => point.values);
    const minimum = Math.min(...all);
    const maximum = Math.max(...all);
    const padding = Math.max((maximum - minimum) * 0.12, Math.abs(maximum) * 0.005, 0.05);
    return { values, minimum: minimum - padding, maximum: maximum + padding };
  }, [series, indexed]);
  const selectedIndex = Math.max(0, chart?.values.findIndex(point => point.period === selectedPeriod) ?? -1);
  const selected = chart?.values.find(point => point.period === selectedPeriod) ?? chart?.values.at(-1);
  const height = 225;
  const left = 62;
  const right = 14;
  const top = 24;
  const bottom = 38;
  const coordinate = (index: number) => chart ? left + (chart.values[index].time - chart.values[0].time) / (chart.values.at(-1)!.time - chart.values[0].time) * (width - left - right) : left;
  const ordinate = (value: number) => chart ? height - bottom - (value - chart.minimum) / (chart.maximum - chart.minimum) * (height - top - bottom) : 0;
  const activeIndex = chart?.values.indexOf(selected!) ?? 0;

  return <div ref={container} className="min-w-0">
    {!chart ? <p className="py-14 text-sm text-[var(--ink-2)]">Comparable history is unavailable.</p> : <>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--ink-2)]">{series.map((item, index) => <span key={item.key} className="inline-flex items-center gap-2"><span className="h-0.5 w-4" style={{ background: item.color }} />{item.label}<span className="font-mono tabular-nums text-[var(--ink)]">{selected?.values[index].toFixed(1)}{unit === "%" ? "%" : ""}</span></span>)}</div>
      {width > left + right && <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.map(item => item.label).join(" and ")} ${projection ? "conditional scenario, not a forecast" : "history"}. ${indexed ? `Rebased to 100 at ${chart.values[0].period}.` : `Values in ${unit}.`} Use the date slider to inspect values.`} onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const fraction = (event.clientX - bounds.left - left) / (width - left - right);
        const time = chart.values[0].time + Math.max(0, Math.min(1, fraction)) * (chart.values.at(-1)!.time - chart.values[0].time);
        const index = chart.values.reduce((best, point, candidate) => Math.abs(point.time - time) < Math.abs(chart.values[best].time - time) ? candidate : best, 0);
        setSelectedPeriod(chart.values[index].period);
      }}>
        <text x={left} y="12" fill="var(--ink-2)" fontSize="11">{indexed ? `${chart.values[0].period} = 100` : unit}</text>
        {[0, 1, 2, 3].map(tick => {
          const value = chart.minimum + (chart.maximum - chart.minimum) * tick / 3;
          return <g key={tick}><line x1={left} x2={width - right} y1={ordinate(value)} y2={ordinate(value)} stroke="var(--line)" /><text x={left - 9} y={ordinate(value) + 4} textAnchor="end" fill="var(--ink-2)" fontSize="11">{Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(1)}</text></g>;
        })}
        {series.map((item, seriesIndex) => <path key={item.key} d={chart.values.map((point, index) => `${index ? "L" : "M"}${coordinate(index).toFixed(2)},${ordinate(point.values[seriesIndex]).toFixed(2)}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray={projection ? seriesIndex === 1 ? "3 4" : "8 4" : seriesIndex === 1 ? "5 3" : undefined} />)}
        {selected && <><line x1={coordinate(activeIndex)} x2={coordinate(activeIndex)} y1={top} y2={height - bottom} stroke="var(--ink-3)" strokeDasharray="2 4" />{series.map((item, index) => <circle key={item.key} cx={coordinate(activeIndex)} cy={ordinate(selected.values[index])} r="3.5" fill={item.color} />)}</>}
        <text x={left} y={height - 14} fill="var(--ink-2)" fontSize="11">{chart.values[0].period}</text><text x={width - right} y={height - 14} textAnchor="end" fill="var(--ink-2)" fontSize="11">{chart.values.at(-1)?.period}</text>
      </svg>}
      <label className="mt-1 flex items-center gap-4 text-xs text-[var(--ink-2)]"><span className="min-w-16 font-mono tabular-nums">{selected?.period}</span><input aria-label={projection ? "Inspect scenario year" : "Inspect observation date"} aria-valuetext={selected?.period} className="min-w-0 flex-1 accent-[#8b9dff]" type="range" min="0" max={chart.values.length - 1} value={selectedPeriod && chart.values.some(point => point.period === selectedPeriod) ? selectedIndex : chart.values.length - 1} onChange={event => setSelectedPeriod(chart.values[Number(event.target.value)].period)} /></label>
    </>}
  </div>;
}
