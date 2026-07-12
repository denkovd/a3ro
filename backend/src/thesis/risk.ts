/* ────────────────────────────────────────────────────────────────
   Portfolio risk engine — pure, deterministic, no IO.

   Consumes positions ALREADY marked by the assembler (marks come
   from latest_quotes / bull_snapshots / manual, each labeled), plus
   per-symbol daily close series for correlation/beta, plus an
   optional thesis-linked ScenarioSet. Emits the PortfolioRiskReport.

   Honesty contract (house rule):
   • A position with no live mark and no manual mark falls back to
     entry price, LABELED entry_fallback, and raises a STALE_MARK flag
     — it is never silently priced.
   • A position with no vol proxy is UNMODELED: excluded from risk
     shares and scenario totals, counted in coverage, flagged. Missing
     data reduces coverage; it never becomes a hidden zero.
   • Every flag carries the numbers that fired it.
──────────────────────────────────────────────────────────────── */

import {
  CorrelationPair,
  MarkedPosition,
  PortfolioRiskReport,
  PositionRisk,
  RiskFlag,
  ScenarioId,
  ScenarioSet,
} from "./types";

const round2 = (x: number): number => Math.round(x * 100) / 100;
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

/* ── correlation from close series ────────────────────────────── */

/** Log returns keyed by date, inner-joined per pair. */
function logReturnsByDate(series: { date: string; close: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (prev.close > 0 && cur.close > 0) out.set(cur.date, Math.log(cur.close / prev.close));
  }
  return out;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 20) return null; // below this a ρ is numerology
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export interface PairwiseResult {
  pairs: CorrelationPair[];
  avg: number | null;
  used: number;
}

export function pairwiseCorrelations(
  symbols: string[],
  seriesBySymbol: Map<string, { date: string; close: number }[]>,
): PairwiseResult {
  const rets = new Map<string, Map<string, number>>();
  for (const s of symbols) {
    const series = seriesBySymbol.get(s);
    if (series && series.length >= 21) rets.set(s, logReturnsByDate(series));
  }
  const pairs: CorrelationPair[] = [];
  const syms = [...rets.keys()];
  for (let i = 0; i < syms.length; i++) {
    for (let j = i + 1; j < syms.length; j++) {
      const a = rets.get(syms[i])!;
      const b = rets.get(syms[j])!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [date, ra] of a) {
        const rb = b.get(date);
        if (rb !== undefined) { xs.push(ra); ys.push(rb); }
      }
      const rho = pearson(xs, ys);
      if (rho !== null) pairs.push({ a: syms[i], b: syms[j], rho: round4(rho), observations: xs.length });
    }
  }
  pairs.sort((p, q) => Math.abs(q.rho) - Math.abs(p.rho));
  const avg = pairs.length ? round4(pairs.reduce((s, p) => s + p.rho, 0) / pairs.length) : null;
  return { pairs, avg, used: pairs.length };
}

/** Greedy ρ≥0.7 clusters (union of high pairs), for the crowding read. */
export function correlationClusters(
  pairs: CorrelationPair[],
  weightBySymbol: Map<string, number>,
): { symbols: string[]; combinedWeightPct: number }[] {
  const high = pairs.filter((p) => p.rho >= 0.7);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of high) {
    if (!parent.has(p.a)) parent.set(p.a, p.a);
    if (!parent.has(p.b)) parent.set(p.b, p.b);
    union(p.a, p.b);
  }
  const groups = new Map<string, string[]>();
  for (const s of parent.keys()) {
    const r = find(s);
    groups.set(r, [...(groups.get(r) ?? []), s]);
  }
  const out: { symbols: string[]; combinedWeightPct: number }[] = [];
  for (const symbols of groups.values()) {
    if (symbols.length < 2) continue;
    const w = symbols.reduce((s, sym) => s + (weightBySymbol.get(sym) ?? 0), 0);
    out.push({ symbols: symbols.sort(), combinedWeightPct: round2(w * 100) });
  }
  out.sort((a, b) => b.combinedWeightPct - a.combinedWeightPct);
  return out;
}

/* ── beta to the scenario driver ──────────────────────────────── */

export function betaTo(
  target: { date: string; close: number }[] | undefined,
  driver: { date: string; close: number }[] | undefined,
): { beta: number; observations: number } | null {
  if (!target || !driver) return null;
  const tr = logReturnsByDate(target);
  const dr = logReturnsByDate(driver);
  const xs: number[] = []; // driver
  const ys: number[] = []; // target
  for (const [date, d] of dr) {
    const t = tr.get(date);
    if (t !== undefined) { xs.push(d); ys.push(t); }
  }
  if (xs.length < 20) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0;
  for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; }
  if (vx === 0) return null;
  return { beta: cov / vx, observations: n };
}

/* ── main ─────────────────────────────────────────────────────── */

export interface RiskInputs {
  positions: MarkedPosition[];
  seriesBySymbol: Map<string, { date: string; close: number }[]>;
  /** Scenario set from the linked (or latest) thesis, if any. */
  scenarioSet: ScenarioSet | null;
  /** Driver series for scenario beta (the scenario instrument's own closes). */
  driverSeries: { date: string; close: number }[] | null;
  /** Thesis strength lookup for linked positions. */
  thesisMeta: Map<number, { strength: number; verdict: string; title: string }>;
}

export function buildRiskReport(inputs: RiskInputs): PortfolioRiskReport {
  const { positions, seriesBySymbol, scenarioSet, driverSeries, thesisMeta } = inputs;
  const flags: RiskFlag[] = [];

  const marked = positions.filter((p) => p.mark !== null && p.exposure !== null);
  const gross = marked.reduce((s, p) => s + (p.exposure as number), 0);
  const net = marked.reduce((s, p) => s + (p.exposure as number) * (p.side === "short" ? -1 : 1), 0);

  // weights (of gross)
  for (const p of positions) {
    p.weight = p.exposure !== null && gross > 0 ? (p.exposure as number) / gross : null;
  }

  const sorted = [...positions].sort((a, b) => (b.exposure ?? 0) - (a.exposure ?? 0));

  /* ── concentration ── */
  const weights = sorted.map((p) => p.weight ?? 0).filter((w) => w > 0);
  let concentration: PortfolioRiskReport["concentration"];
  if (weights.length === 0) {
    concentration = { top1Pct: null, top3Pct: null, hhi: null, label: "N/A", detail: "no marked positions" };
  } else {
    const top1 = weights[0];
    const top3 = weights.slice(0, 3).reduce((s, w) => s + w, 0);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    const label = hhi >= 0.35 || top1 >= 0.4 ? "CONCENTRATED" : hhi >= 0.18 ? "MODERATE" : "DIVERSIFIED";
    concentration = {
      top1Pct: round2(top1 * 100),
      top3Pct: round2(top3 * 100),
      hhi: round4(hhi),
      label,
      detail: `HHI ${round4(hhi)} (≥0.35 concentrated, ≥0.18 moderate) · top position ${round2(top1 * 100)}% · top 3 ${round2(top3 * 100)}% of gross`,
    };
  }

  /* ── correlation & clusters ── */
  const weightBySymbol = new Map<string, number>();
  for (const p of sorted) {
    if (p.weight !== null) weightBySymbol.set(p.symbol, (weightBySymbol.get(p.symbol) ?? 0) + p.weight);
  }
  const { pairs, avg, used } = pairwiseCorrelations([...new Set(sorted.map((p) => p.symbol))], seriesBySymbol);
  const highPairs = pairs.filter((p) => p.rho >= 0.7);
  const clusters = correlationClusters(pairs, weightBySymbol);
  const correlation = {
    avgPairwise: avg,
    pairsUsed: used,
    highPairs: highPairs.slice(0, 8),
    clusters,
    detail:
      used > 0
        ? `${used} pair${used === 1 ? "" : "s"} with ≥20 overlapping sessions · avg ρ ${avg} · ${highPairs.length} pair${highPairs.length === 1 ? "" : "s"} ≥ 0.70`
        : "not enough overlapping bar history to correlate — needs ≥21 shared sessions per pair",
  };
  for (const c of clusters) {
    if (c.combinedWeightPct >= 40) {
      flags.push({
        kind: "CORRELATION_STACK",
        severity: "high",
        positionId: null,
        symbol: null,
        message: `${c.symbols.join(" + ")} move together (ρ ≥ 0.70) and sum to ${c.combinedWeightPct}% of gross`,
        detail: "Correlated positions are one position wearing different tickers. Size them as one.",
      });
    }
  }

  /* ── per-position risk contribution ── */
  const withVol = sorted.filter((p) => p.dailyVol !== null && p.weight !== null);
  const contribRaw = new Map<number, number>();
  for (const p of withVol) contribRaw.set(p.id, (p.weight as number) * (p.dailyVol as number));
  const totalContrib = [...contribRaw.values()].reduce((s, v) => s + v, 0);

  /* scenario P&L per position: beta × scenario move × exposure × side */
  const betaBySymbol = new Map<string, { beta: number; observations: number } | null>();
  if (scenarioSet && driverSeries) {
    for (const sym of new Set(sorted.map((p) => p.symbol))) {
      betaBySymbol.set(
        sym,
        sym === scenarioSet.instrument ? { beta: 1, observations: driverSeries.length } : betaTo(seriesBySymbol.get(sym), driverSeries),
      );
    }
  }

  const positionRisks: PositionRisk[] = sorted.map((p, idx) => {
    const meta = p.thesisId !== null ? thesisMeta.get(p.thesisId) ?? null : null;
    const contrib = contribRaw.get(p.id) ?? null;
    const reasons: string[] = [];
    if (contrib !== null && p.dailyVol !== null && p.weight !== null) {
      reasons.push(`risk = weight ${round2((p.weight as number) * 100)}% × daily vol ${round2((p.dailyVol as number) * 100)}% (${p.volSource})`);
    } else {
      reasons.push(`unmodeled: no vol proxy (${p.volSource}) — excluded from risk shares, flagged`);
    }
    if (meta) reasons.push(`linked thesis "${meta.title}" — strength ${meta.strength}/100 (${meta.verdict})`);

    const scenarioPnl: Partial<Record<ScenarioId, number | null>> = {};
    if (scenarioSet && p.exposure !== null) {
      const b = betaBySymbol.get(p.symbol) ?? null;
      for (const sc of scenarioSet.scenarios) {
        if (sc.movePct === null) { scenarioPnl[sc.id] = null; continue; }
        if (b === null) { scenarioPnl[sc.id] = null; continue; }
        const sideSign = p.side === "short" ? -1 : 1;
        scenarioPnl[sc.id] = round2((p.exposure as number) * sideSign * b.beta * (sc.movePct / 100));
      }
      if (b !== null && p.symbol !== scenarioSet.instrument) {
        reasons.push(`scenario β ${round2(b.beta)} to ${scenarioSet.instrument} over ${b.observations} shared sessions`);
      } else if (b === null) {
        reasons.push(`no β to ${scenarioSet.instrument} (needs ≥20 shared sessions) — scenario P&L unmodeled`);
      }
    }

    return {
      positionId: p.id,
      symbol: p.symbol,
      riskContribution: contrib !== null ? round4(contrib) : null,
      riskShare: contrib !== null && totalContrib > 0 ? round4(contrib / totalContrib) : null,
      thesisStrength: meta?.strength ?? null,
      thesisVerdict: meta?.verdict ?? null,
      sizeRank: idx + 1,
      riskRank: null, // filled below
      scenarioPnl,
      reasons,
    };
  });

  const byRisk = [...positionRisks].filter((r) => r.riskContribution !== null).sort((a, b) => (b.riskContribution as number) - (a.riskContribution as number));
  byRisk.forEach((r, i) => { r.riskRank = i + 1; });
  positionRisks.sort((a, b) => (b.riskContribution ?? -1) - (a.riskContribution ?? -1));

  /* ── scenario totals ── */
  const scenarioTotals: PortfolioRiskReport["scenarioTotals"] = {};
  if (scenarioSet) {
    for (const sc of scenarioSet.scenarios) {
      let total = 0, modeled = 0, unmodeled = 0;
      for (const r of positionRisks) {
        const v = r.scenarioPnl[sc.id];
        if (v === null || v === undefined) unmodeled++;
        else { total += v; modeled++; }
      }
      scenarioTotals[sc.id] = { total: round2(total), modeled, unmodeled };
    }
  }

  /* ── flags ── */
  for (const p of sorted) {
    const risk = positionRisks.find((r) => r.positionId === p.id)!;

    if (p.markSource === "entry_fallback" || p.markSource === "none") {
      flags.push({
        kind: "STALE_MARK",
        severity: "medium",
        positionId: p.id,
        symbol: p.symbol,
        message: `${p.symbol}: no live mark — using ${p.markSource === "entry_fallback" ? "entry price" : "nothing"}`,
        detail: "P&L and exposure for this position are stale. Add a manual mark or use a symbol with a live feed.",
      });
    }
    if (p.dailyVol === null) {
      flags.push({
        kind: "UNMODELED",
        severity: "medium",
        positionId: p.id,
        symbol: p.symbol,
        message: `${p.symbol}: no volatility proxy — excluded from risk ranking and scenario totals`,
        detail: `vol source: ${p.volSource}. Risk numbers below understate the book by this position's share.`,
      });
    }
    if (p.weight !== null && p.weight >= 0.1 && p.thesisId === null) {
      flags.push({
        kind: "NO_THESIS",
        severity: p.weight >= 0.25 ? "high" : "medium",
        positionId: p.id,
        symbol: p.symbol,
        message: `${p.symbol} is ${round2((p.weight as number) * 100)}% of gross with no linked thesis`,
        detail: "Size without a written, pressure-tested reason is conviction you can't audit. Link or trim.",
      });
    }
    const meta = p.thesisId !== null ? thesisMeta.get(p.thesisId) : undefined;
    if (meta && p.weight !== null && p.weight >= 0.15 && meta.strength < 45) {
      flags.push({
        kind: "OVERSIZED_WEAK_THESIS",
        severity: "high",
        positionId: p.id,
        symbol: p.symbol,
        message: `${p.symbol}: ${round2((p.weight as number) * 100)}% of gross on a thesis scoring ${meta.strength}/100 (${meta.verdict})`,
        detail: `Size rank #${risk.sizeRank} vs thesis strength ${meta.strength} — the book is biggest where the reasoning is weakest.`,
      });
    }
    if (p.trendVerdict) {
      const v = p.trendVerdict.toUpperCase();
      const conflict = (p.side === "long" && v.includes("BEAR")) || (p.side === "short" && v.includes("BULL"));
      if (conflict) {
        flags.push({
          kind: "TREND_CONFLICT",
          severity: p.weight !== null && p.weight >= 0.15 ? "high" : "low",
          positionId: p.id,
          symbol: p.symbol,
          message: `${p.symbol}: ${p.side} against a ${p.trendVerdict} Money Line state`,
          detail: "Fighting a double-confirmed state is a fine trade only when it's deliberate. Confirm it is.",
        });
      }
    }
  }

  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  flags.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return {
    generatedAt: new Date().toISOString(),
    positionCount: positions.length,
    grossExposure: round2(gross),
    netExposure: round2(net),
    concentration,
    correlation,
    positions: sorted,
    positionRisks,
    flags,
    scenarioTotals,
    scenarioBasis: scenarioSet
      ? `Scenario legs from "${scenarioSet.instrument}" σ-multiples (${scenarioSet.sigmaBasis}); per-position P&L = exposure × β × scenario move. β from ≥20 shared sessions of daily bars.`
      : "No thesis-linked scenario set supplied — scenario totals suppressed.",
    coverage: {
      markedPositions: marked.length,
      modeledPositions: withVol.length,
      totalPositions: positions.length,
    },
  };
}
