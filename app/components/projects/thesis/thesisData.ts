"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 Thesis Lab — client data layer.
   Endpoints: POST /api/thesis/analyze · GET /api/thesis ·
   GET/DELETE /api/thesis/[id] · GET/POST /api/portfolio/positions ·
   PATCH/DELETE /api/portfolio/positions/[id] · GET /api/portfolio/risk.

   Same posture as macroData.ts: field-by-field normalisation, a
   malformed payload degrades to an honest state (never a crash,
   never a modeled number shown as live — A3RO truth-pass rule).
   Types here MIRROR backend/src/thesis/types.ts shapes but are
   normalized independently — a partial payload still renders.
──────────────────────────────────────────────────────────────── */

/* ── palette: diagnostic cyan — analysis/pressure, distinct from oil
   amber, regime mint, macro periwinkle, bull steel-blue ── */
export const LAB_ACCENT = "#62d9e8";
export const LAB_AMBER = "#d4a157"; // stressed / warning (house)
export const LAB_PINK = "#a8496b"; // broken / danger (house)
export const LAB_MINT = "#5fc9a4"; // holds / supportive (house)

export const LAB_ROUTE = "/Projects/Thesis-Lab";

/* ── shapes (normalized mirrors of the backend types) ─────────── */

export type CheckVerdict = "supports" | "contradicts" | "neutral" | "no_data";

export type LabCheck = {
  source: string;
  claimExpects: string;
  marketReads: string;
  verdict: CheckVerdict;
  effect: number;
};

export type LabAssumption = {
  id: string;
  origin: "explicit" | "implied";
  kind: string;
  text: string;
  sourceSentence: string | null;
  statedConfidence: number | null;
  evidenceScore: number | null;
  certaintyMarkers: string[];
  hedgeMarkers: string[];
  confidence: number;
  fragility: number;
  fakeConfidence: boolean;
  reasons: string[];
  checks: LabCheck[];
  counterCase: string;
  killEvidence: string[];
};

export type LabStrengthComponent = { key: string; label: string; effect: number; detail: string };
export type LabCoverage = { source: string; live: boolean; detail: string };

export type LabAnalysis = {
  strength: number;
  verdict: string;
  headline: string;
  direction: string;
  directionSource: string;
  instrument: string;
  instrumentLabel: string;
  horizonDays: number;
  horizonSource: string;
  targetPrice: number | null;
  assumptions: LabAssumption[];
  strengthComponents: LabStrengthComponent[];
  contextCoverage: LabCoverage[];
};

export type OutcomeState = "holds" | "stressed" | "breaks";
export type LabScenario = {
  id: string;
  name: string;
  narrative: string;
  sigma: number;
  price: number | null;
  movePct: number | null;
  probability: number | null;
  probabilityBasis: string;
  thesisPnlPct: number | null;
  thesisImpact: string;
  outcomes: { assumptionId: string; state: OutcomeState; why: string }[];
};

export type LabScenarioSet = {
  instrument: string;
  anchorPrice: number | null;
  anchorSource: string;
  horizonDays: number;
  horizonSigma: number | null;
  sigmaBasis: string;
  probabilityNote: string;
  scenarios: LabScenario[];
};

export type LabResult = {
  analysis: LabAnalysis;
  scenarios: LabScenarioSet;
  thesisId: number | null;
  /** Server-side degradation notes (context unavailable / save failed) — shown, never hidden. */
  notice: string | null;
};

export type ThesisSummary = {
  id: number;
  title: string;
  direction: string | null;
  instrument: string | null;
  strength: number | null;
  verdict: string | null;
  createdAt: string;
};

export type LabPosition = {
  id: number;
  symbol: string;
  displayName: string | null;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  manualMark: number | null;
  thesisId: number | null;
  notes: string | null;
  mark: number | null;
  markSource: string;
  markAsOf: string | null;
  exposure: number | null;
  weight: number | null;
  pnlPct: number | null;
  atrPct: number | null;
  trendVerdict: string | null;
  dailyVol: number | null;
  volSource: string;
};

export type LabFlag = {
  kind: string;
  severity: "high" | "medium" | "low";
  positionId: number | null;
  symbol: string | null;
  message: string;
  detail: string;
};

export type LabPositionRisk = {
  positionId: number;
  symbol: string;
  riskShare: number | null;
  thesisStrength: number | null;
  thesisVerdict: string | null;
  sizeRank: number;
  riskRank: number | null;
  scenarioPnl: Record<string, number | null>;
  reasons: string[];
};

export type LabRiskReport = {
  positionCount: number;
  grossExposure: number;
  netExposure: number;
  concentration: { top1Pct: number | null; top3Pct: number | null; hhi: number | null; label: string; detail: string };
  correlation: {
    avgPairwise: number | null;
    pairsUsed: number;
    highPairs: { a: string; b: string; rho: number; observations: number }[];
    clusters: { symbols: string[]; combinedWeightPct: number }[];
    detail: string;
  };
  positions: LabPosition[];
  positionRisks: LabPositionRisk[];
  flags: LabFlag[];
  scenarioTotals: Record<string, { total: number; modeled: number; unmodeled: number }>;
  scenarioBasis: string;
  coverage: { markedPositions: number; modeledPositions: number; totalPositions: number };
};

/* ── normalisers (never throw) ────────────────────────────────── */

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : fb);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");

const VERDICTS: CheckVerdict[] = ["supports", "contradicts", "neutral", "no_data"];

function normCheck(raw: unknown): LabCheck | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const source = strOrNull(o.source);
  if (!source) return null;
  return {
    source,
    claimExpects: str(o.claimExpects),
    marketReads: str(o.marketReads),
    verdict: VERDICTS.includes(o.verdict as CheckVerdict) ? (o.verdict as CheckVerdict) : "no_data",
    effect: num(o.effect) ?? 0,
  };
}

function normAssumption(raw: unknown): LabAssumption | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = strOrNull(o.id);
  const text = strOrNull(o.text);
  if (!id || !text) return null;
  const lang = (o.language ?? null) as Record<string, unknown> | null;
  return {
    id,
    origin: o.origin === "implied" ? "implied" : "explicit",
    kind: str(o.kind, "claim"),
    text,
    sourceSentence: strOrNull(o.sourceSentence),
    statedConfidence: lang ? num(lang.statedConfidence) : null,
    evidenceScore: lang ? num(lang.evidenceScore) : null,
    certaintyMarkers: lang ? strArr(lang.certaintyMarkers) : [],
    hedgeMarkers: lang ? strArr(lang.hedgeMarkers) : [],
    confidence: num(o.confidence) ?? 0,
    fragility: num(o.fragility) ?? 0,
    fakeConfidence: bool(o.fakeConfidence),
    reasons: strArr(o.reasons),
    checks: arr(o.checks).map(normCheck).filter((c): c is LabCheck => c !== null),
    counterCase: str(o.counterCase),
    killEvidence: strArr(o.killEvidence),
  };
}

export function normalizeAnalysis(raw: unknown): LabAnalysis | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const parsed = (o.parsed ?? {}) as Record<string, unknown>;
  const strength = num(o.strength);
  if (strength === null) return null;
  return {
    strength,
    verdict: str(o.verdict, "—"),
    headline: str(o.headline),
    direction: str(parsed.direction, "neutral"),
    directionSource: str(parsed.directionSource, "default"),
    instrument: str(parsed.instrument, "—"),
    instrumentLabel: str(parsed.instrumentLabel, str(parsed.instrument, "—")),
    horizonDays: num(parsed.horizonDays) ?? 90,
    horizonSource: str(parsed.horizonSource, "default"),
    targetPrice: num(parsed.targetPrice),
    assumptions: arr(o.assumptions).map(normAssumption).filter((a): a is LabAssumption => a !== null),
    strengthComponents: arr(o.strengthComponents)
      .map((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        const key = strOrNull(x.key);
        if (!key) return null;
        return { key, label: str(x.label, key), effect: num(x.effect) ?? 0, detail: str(x.detail) };
      })
      .filter((c): c is LabStrengthComponent => c !== null),
    contextCoverage: arr(o.contextCoverage)
      .map((c) => {
        const x = (c ?? {}) as Record<string, unknown>;
        const source = strOrNull(x.source);
        if (!source) return null;
        return { source, live: bool(x.live), detail: str(x.detail) };
      })
      .filter((c): c is LabCoverage => c !== null),
  };
}

const OUTCOME_STATES: OutcomeState[] = ["holds", "stressed", "breaks"];

export function normalizeScenarioSet(raw: unknown): LabScenarioSet | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const scenarios = arr(o.scenarios)
    .map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      const id = strOrNull(x.id);
      if (!id) return null;
      return {
        id,
        name: str(x.name, id),
        narrative: str(x.narrative),
        sigma: num(x.sigma) ?? 0,
        price: num(x.price),
        movePct: num(x.movePct),
        probability: num(x.probability),
        probabilityBasis: str(x.probabilityBasis),
        thesisPnlPct: num(x.thesisPnlPct),
        thesisImpact: str(x.thesisImpact),
        outcomes: arr(x.assumptionOutcomes)
          .map((oc) => {
            const y = (oc ?? {}) as Record<string, unknown>;
            const assumptionId = strOrNull(y.assumptionId);
            if (!assumptionId) return null;
            return {
              assumptionId,
              state: OUTCOME_STATES.includes(y.state as OutcomeState) ? (y.state as OutcomeState) : "stressed",
              why: str(y.why),
            };
          })
          .filter((v): v is LabScenario["outcomes"][number] => v !== null),
      };
    })
    .filter((s): s is LabScenario => s !== null);
  if (scenarios.length === 0) return null;
  return {
    instrument: str(o.instrument, "—"),
    anchorPrice: num(o.anchorPrice),
    anchorSource: str(o.anchorSource),
    horizonDays: num(o.horizonDays) ?? 90,
    horizonSigma: num(o.horizonSigma),
    sigmaBasis: str(o.sigmaBasis),
    probabilityNote: str(o.probabilityNote),
    scenarios,
  };
}

export function normalizePosition(raw: unknown): LabPosition | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = num(o.id);
  const symbol = strOrNull(o.symbol);
  if (id === null || !symbol) return null;
  return {
    id,
    symbol,
    displayName: strOrNull(o.displayName),
    side: o.side === "short" ? "short" : "long",
    quantity: num(o.quantity) ?? 0,
    entryPrice: num(o.entryPrice) ?? 0,
    manualMark: num(o.manualMark),
    thesisId: num(o.thesisId),
    notes: strOrNull(o.notes),
    mark: num(o.mark),
    markSource: str(o.markSource, "none"),
    markAsOf: strOrNull(o.markAsOf),
    exposure: num(o.exposure),
    weight: num(o.weight),
    pnlPct: num(o.pnlPct),
    atrPct: num(o.atrPct),
    trendVerdict: strOrNull(o.trendVerdict),
    dailyVol: num(o.dailyVol),
    volSource: str(o.volSource, "—"),
  };
}

export function normalizeRiskReport(raw: unknown): LabRiskReport | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (num(o.grossExposure) === null || !Array.isArray(o.positions)) return null;
  const conc = (o.concentration ?? {}) as Record<string, unknown>;
  const corr = (o.correlation ?? {}) as Record<string, unknown>;
  const cov = (o.coverage ?? {}) as Record<string, unknown>;
  const totalsRaw = (o.scenarioTotals ?? {}) as Record<string, unknown>;
  const scenarioTotals: LabRiskReport["scenarioTotals"] = {};
  for (const [k, v] of Object.entries(totalsRaw)) {
    const x = (v ?? {}) as Record<string, unknown>;
    const total = num(x.total);
    if (total !== null) scenarioTotals[k] = { total, modeled: num(x.modeled) ?? 0, unmodeled: num(x.unmodeled) ?? 0 };
  }
  return {
    positionCount: num(o.positionCount) ?? 0,
    grossExposure: num(o.grossExposure) ?? 0,
    netExposure: num(o.netExposure) ?? 0,
    concentration: {
      top1Pct: num(conc.top1Pct),
      top3Pct: num(conc.top3Pct),
      hhi: num(conc.hhi),
      label: str(conc.label, "N/A"),
      detail: str(conc.detail),
    },
    correlation: {
      avgPairwise: num(corr.avgPairwise),
      pairsUsed: num(corr.pairsUsed) ?? 0,
      highPairs: arr(corr.highPairs)
        .map((p) => {
          const x = (p ?? {}) as Record<string, unknown>;
          const a = strOrNull(x.a);
          const b = strOrNull(x.b);
          const rho = num(x.rho);
          if (!a || !b || rho === null) return null;
          return { a, b, rho, observations: num(x.observations) ?? 0 };
        })
        .filter((p): p is LabRiskReport["correlation"]["highPairs"][number] => p !== null),
      clusters: arr(corr.clusters)
        .map((c) => {
          const x = (c ?? {}) as Record<string, unknown>;
          const symbols = strArr(x.symbols);
          if (symbols.length < 2) return null;
          return { symbols, combinedWeightPct: num(x.combinedWeightPct) ?? 0 };
        })
        .filter((c): c is LabRiskReport["correlation"]["clusters"][number] => c !== null),
      detail: str(corr.detail),
    },
    positions: arr(o.positions).map(normalizePosition).filter((p): p is LabPosition => p !== null),
    positionRisks: arr(o.positionRisks)
      .map((r) => {
        const x = (r ?? {}) as Record<string, unknown>;
        const positionId = num(x.positionId);
        const symbol = strOrNull(x.symbol);
        if (positionId === null || !symbol) return null;
        const pnlRaw = (x.scenarioPnl ?? {}) as Record<string, unknown>;
        const scenarioPnl: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(pnlRaw)) scenarioPnl[k] = num(v);
        return {
          positionId,
          symbol,
          riskShare: num(x.riskShare),
          thesisStrength: num(x.thesisStrength),
          thesisVerdict: strOrNull(x.thesisVerdict),
          sizeRank: num(x.sizeRank) ?? 0,
          riskRank: num(x.riskRank),
          scenarioPnl,
          reasons: strArr(x.reasons),
        };
      })
      .filter((r): r is LabPositionRisk => r !== null),
    flags: arr(o.flags)
      .map((f) => {
        const x = (f ?? {}) as Record<string, unknown>;
        const kind = strOrNull(x.kind);
        if (!kind) return null;
        return {
          kind,
          severity: x.severity === "high" ? "high" : x.severity === "low" ? "low" : "medium",
          positionId: num(x.positionId),
          symbol: strOrNull(x.symbol),
          message: str(x.message),
          detail: str(x.detail),
        } as LabFlag;
      })
      .filter((f): f is LabFlag => f !== null),
    scenarioTotals,
    scenarioBasis: str(o.scenarioBasis),
    coverage: {
      markedPositions: num(cov.markedPositions) ?? 0,
      modeledPositions: num(cov.modeledPositions) ?? 0,
      totalPositions: num(cov.totalPositions) ?? 0,
    },
  };
}

export function normalizeThesisSummaries(raw: unknown): ThesisSummary[] {
  const o = (raw ?? {}) as Record<string, unknown>;
  return arr(o.theses)
    .map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const id = num(x.id);
      const title = strOrNull(x.title);
      if (id === null || !title) return null;
      return {
        id,
        title,
        direction: strOrNull(x.direction),
        instrument: strOrNull(x.instrument),
        strength: num(x.strength),
        verdict: strOrNull(x.verdict),
        createdAt: str(x.createdAt),
      };
    })
    .filter((t): t is ThesisSummary => t !== null);
}

/* ── API calls (all no-store; errors → typed results, never throws) ── */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; setup?: boolean };

async function readError(res: Response, body: Record<string, unknown>): Promise<ApiResult<never>> {
  const error = typeof body.error === "string" ? body.error : `api ${res.status}`;
  return { ok: false, error, setup: res.status === 503 };
}

export async function apiAnalyze(input: {
  title: string;
  body: string;
  direction?: string;
  instrument?: string;
  horizonDays?: number;
  save?: boolean;
}): Promise<ApiResult<LabResult>> {
  try {
    const res = await fetch("/api/thesis/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    const analysis = normalizeAnalysis(body.analysis);
    const scenarios = normalizeScenarioSet(body.scenarios);
    if (!analysis || !scenarios) return { ok: false, error: "malformed analysis payload" };
    const notes = [body.contextError, body.saveError].filter((x): x is string => typeof x === "string");
    return { ok: true, data: { analysis, scenarios, thesisId: num(body.thesisId), notice: notes.length ? notes.join(" · ") : null } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiListTheses(): Promise<ApiResult<ThesisSummary[]>> {
  try {
    const res = await fetch("/api/thesis", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    return { ok: true, data: normalizeThesisSummaries(body) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiGetThesis(id: number): Promise<ApiResult<LabResult>> {
  try {
    const res = await fetch(`/api/thesis/${id}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    const row = (body.thesis ?? {}) as Record<string, unknown>;
    const stored = (row.analysis ?? {}) as Record<string, unknown>;
    const analysis = normalizeAnalysis(stored.analysis);
    const scenarios = normalizeScenarioSet(stored.scenarios);
    if (!analysis || !scenarios) return { ok: false, error: "stored analysis is malformed" };
    return { ok: true, data: { analysis, scenarios, thesisId: num(row.id), notice: null } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiDeleteThesis(id: number): Promise<ApiResult<null>> {
  try {
    const res = await fetch(`/api/thesis/${id}`, { method: "DELETE", cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiListPositions(): Promise<ApiResult<LabPosition[]>> {
  try {
    const res = await fetch("/api/portfolio/positions", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    return { ok: true, data: arr(body.positions).map(normalizePosition).filter((p): p is LabPosition => p !== null) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiAddPosition(input: {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  manualMark?: number;
  thesisId?: number | null;
  notes?: string;
}): Promise<ApiResult<number>> {
  try {
    const res = await fetch("/api/portfolio/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    const id = num(body.id);
    return id !== null ? { ok: true, data: id } : { ok: false, error: "no id returned" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiPatchPosition(id: number, patch: Record<string, unknown>): Promise<ApiResult<null>> {
  try {
    const res = await fetch(`/api/portfolio/positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiDeletePosition(id: number): Promise<ApiResult<null>> {
  try {
    const res = await fetch(`/api/portfolio/positions/${id}`, { method: "DELETE", cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function apiRiskReport(thesisId: number | null): Promise<ApiResult<{ report: LabRiskReport; thesis: { id: number; title: string } | null }>> {
  try {
    const res = await fetch(`/api/portfolio/risk${thesisId !== null ? `?thesisId=${thesisId}` : ""}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return readError(res, body);
    const report = normalizeRiskReport(body.report);
    if (!report) return { ok: false, error: "malformed risk payload" };
    const t = (body.thesis ?? null) as Record<string, unknown> | null;
    const thesis = t && num(t.id) !== null ? { id: num(t.id) as number, title: str(t.title, `#${num(t.id)}`) } : null;
    return { ok: true, data: { report, thesis } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

/* ── display helpers (deterministic) ──────────────────────────── */

export const fmtUsd = (v: number | null, dp = 2): string =>
  v === null ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const fmtUsdCompact = (v: number | null): string => {
  if (v === null) return "—";
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 10_000) return `${sign}$${(a / 1_000).toFixed(1)}k`;
  return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export const fmtPct = (v: number | null, dp = 1): string =>
  v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}%`;

export const verdictColor = (verdict: string): string =>
  verdict === "ROBUST" ? LAB_MINT : verdict === "TESTED" ? LAB_ACCENT : verdict === "STRAINED" ? LAB_AMBER : verdict === "FRAGILE" ? LAB_PINK : "var(--ink-2)";

export const fragilityColor = (f: number): string => (f >= 70 ? LAB_PINK : f >= 50 ? LAB_AMBER : LAB_MINT);
export const confidenceColor = (c: number): string => (c >= 60 ? LAB_MINT : c >= 40 ? LAB_AMBER : LAB_PINK);

export const outcomeColor = (s: OutcomeState): string => (s === "holds" ? LAB_MINT : s === "stressed" ? LAB_AMBER : LAB_PINK);

export const KIND_LABEL: Record<string, string> = {
  direction: "Direction",
  supply: "Supply",
  demand: "Demand",
  macro: "Macro",
  positioning: "Positioning",
  timing: "Timing",
  level: "Level",
  causal: "Causal chain",
};
