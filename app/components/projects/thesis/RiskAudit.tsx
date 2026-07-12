"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 stage 3 — Portfolio Risk Audit.
   The real book (portfolio_positions) marked live at read time,
   audited against the pressure-tested thesis and its scenario set:
   flags first (the largest risks are IMPOSSIBLE to miss — severity-
   sorted, color-coded left borders), then the book ranked by risk
   contribution (not size), concentration + correlation crowding,
   and scenario P&L totals traced to the pinned thesis. Every
   unmodelable number is labeled and counted — never a hidden zero.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import {
  apiAddPosition,
  apiDeletePosition,
  apiListTheses,
  apiPatchPosition,
  apiRiskReport,
  fmtPct,
  fmtUsd,
  fmtUsdCompact,
  LAB_ACCENT,
  LAB_AMBER,
  LAB_MINT,
  LAB_PINK,
  verdictColor,
  type LabFlag,
  type LabRiskReport,
  type ThesisSummary,
} from "./thesisData";

type Status = "loading" | "live" | "empty" | "error" | "setup";

const SEV_COLOR: Record<LabFlag["severity"], string> = { high: LAB_PINK, medium: LAB_AMBER, low: "var(--ink-3)" };
const SCENARIO_ORDER = ["bear_tail", "bear", "base", "bull", "bull_tail"] as const;
const SCENARIO_SHORT: Record<string, string> = { bear_tail: "Bear tail", bear: "Bear", base: "Base", bull: "Bull", bull_tail: "Bull tail" };

export default function RiskAudit({ pinnedThesisId }: { pinnedThesisId: number | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [report, setReport] = useState<LabRiskReport | null>(null);
  const [thesis, setThesis] = useState<{ id: number; title: string } | null>(null);
  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await apiRiskReport(pinnedThesisId);
    if (!r.ok) {
      setStatus(r.setup ? "setup" : "error");
      setError(r.error);
      return;
    }
    setReport(r.data.report);
    setThesis(r.data.thesis);
    setStatus(r.data.report.positionCount === 0 ? "empty" : "live");
  }, [pinnedThesisId]);

  useEffect(() => {
    setStatus("loading");
    void refresh();
    apiListTheses().then((r) => {
      if (r.ok) setTheses(r.data);
    });
  }, [refresh]);

  const addPosition = useCallback(
    async (input: { symbol: string; side: "long" | "short"; quantity: number; entryPrice: number; thesisId: number | null }) => {
      setBusy(true);
      const r = await apiAddPosition({ ...input, thesisId: input.thesisId ?? undefined });
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        if (r.setup) setStatus("setup");
        return false;
      }
      setError("");
      await refresh();
      return true;
    },
    [refresh],
  );

  const removePosition = useCallback(
    async (id: number) => {
      setBusy(true);
      await apiDeletePosition(id);
      setBusy(false);
      await refresh();
    },
    [refresh],
  );

  const linkThesis = useCallback(
    async (id: number, thesisId: number | null) => {
      setBusy(true);
      await apiPatchPosition(id, { thesisId });
      setBusy(false);
      await refresh();
    },
    [refresh],
  );

  if (status === "loading") {
    return <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Marking the book…</p>;
  }
  if (status === "setup") {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: LAB_AMBER }}>Setup needed</p>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          The book lives in <span className="font-mono">portfolio_positions</span> — run{" "}
          <span className="font-mono text-[var(--ink)]">npm run migrate:thesis</span> in backend/ once, then reload.
        </p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
        Feed unreachable — {error || "risk api error"}
      </p>
    );
  }

  return (
    <div>
      {/* header strip */}
      {report && status === "live" && <HeaderStrip report={report} />}

      {/* flags — the point of the page */}
      {report && report.flags.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            Risk flags · {report.flags.filter((f) => f.severity === "high").length} high
          </p>
          <div className="mt-3 space-y-2">
            {report.flags.map((f, i) => (
              <div key={i} className="rounded-[4px] border-l-2 bg-[var(--depth-1)] py-2.5 pl-4 pr-3" style={{ borderLeftColor: SEV_COLOR[f.severity] }}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: SEV_COLOR[f.severity] }}>
                    {f.severity} · {f.kind.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <span className="text-[12px] text-[var(--ink)]">{f.message}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* positions */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Book · ranked by risk contribution</p>
          {report && (
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              {report.coverage.markedPositions}/{report.coverage.totalPositions} marked · {report.coverage.modeledPositions}/{report.coverage.totalPositions} risk-modeled
            </p>
          )}
        </div>

        {status === "empty" && (
          <div className="mt-3 rounded-[5px] border border-dashed border-[var(--line)] p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">No positions on the book</p>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[var(--ink-3)]">
              Add what you actually hold. Marks come live from the price stores (WTI/BRENT quotes, the ~650-symbol daily scan);
              anything else takes a labeled manual mark.
            </p>
          </div>
        )}

        {report && report.positions.length > 0 && <PositionTable report={report} theses={theses} busy={busy} onDelete={removePosition} onLink={linkThesis} />}
        <AddPositionRow busy={busy} theses={theses} onAdd={addPosition} error={error} />
      </div>

      {/* correlation + scenario totals */}
      {report && status === "live" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <CorrelationPanel report={report} />
          <ScenarioTotalsPanel report={report} thesis={thesis} />
        </div>
      )}
    </div>
  );
}

/* ── header strip ─────────────────────────────────────────────── */

function HeaderStrip({ report }: { report: LabRiskReport }) {
  const concColor =
    report.concentration.label === "CONCENTRATED" ? LAB_PINK : report.concentration.label === "MODERATE" ? LAB_AMBER : report.concentration.label === "DIVERSIFIED" ? LAB_MINT : "var(--ink-3)";
  const netColor = report.netExposure > 0 ? LAB_MINT : report.netExposure < 0 ? LAB_PINK : "var(--ink-2)";
  return (
    <div className="grid gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Gross exposure</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">{fmtUsdCompact(report.grossExposure)}</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{report.positionCount} positions</p>
      </div>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Net exposure</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: netColor }}>{fmtUsdCompact(report.netExposure)}</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
          {report.grossExposure > 0 ? `${Math.round((Math.abs(report.netExposure) / report.grossExposure) * 100)}% directional` : "—"}
        </p>
      </div>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Concentration</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: concColor }}>{report.concentration.label}</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]" title={report.concentration.detail}>
          HHI {report.concentration.hhi ?? "—"} · top {report.concentration.top1Pct ?? "—"}%
        </p>
      </div>
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Avg pairwise ρ</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">
          {report.correlation.avgPairwise === null ? "—" : report.correlation.avgPairwise.toFixed(2)}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{report.correlation.pairsUsed} pairs measured</p>
      </div>
    </div>
  );
}

/* ── positions table ──────────────────────────────────────────── */

function PositionTable({
  report,
  theses,
  busy,
  onDelete,
  onLink,
}: {
  report: LabRiskReport;
  theses: ThesisSummary[];
  busy: boolean;
  onDelete: (id: number) => void;
  onLink: (id: number, thesisId: number | null) => void;
}) {
  // risk-ranked ordering; unmodeled positions sink to the bottom
  const rows = report.positionRisks
    .map((r) => ({ risk: r, pos: report.positions.find((p) => p.id === r.positionId)! }))
    .filter((x) => x.pos);
  const maxShare = Math.max(...rows.map((x) => x.risk.riskShare ?? 0), 0.0001);

  return (
    <div className="mt-3 overflow-x-auto rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)]">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            {["#", "Symbol", "Side", "Qty", "Entry", "Mark", "P&L", "Exposure", "Wt", "Risk share", "Trend", "Thesis", ""].map((h, i) => (
              <th key={i} className="px-3 py-2.5 font-mono text-[9px] font-normal uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ risk, pos }) => {
            const pnlColor = pos.pnlPct === null ? "var(--ink-3)" : pos.pnlPct > 0 ? LAB_MINT : pos.pnlPct < 0 ? LAB_PINK : "var(--ink-2)";
            const markLabel =
              pos.markSource === "latest_quotes" ? "live quote" : pos.markSource === "bull_snapshots" ? `scan${pos.markAsOf ? ` ${pos.markAsOf}` : ""}` : pos.markSource === "manual" ? "manual" : pos.markSource === "entry_fallback" ? "ENTRY (stale)" : "no mark";
            const trendColor = pos.trendVerdict?.toUpperCase().includes("BULL") ? LAB_MINT : pos.trendVerdict?.toUpperCase().includes("BEAR") ? LAB_PINK : "var(--ink-3)";
            return (
              <tr key={pos.id} className="border-b border-[var(--line)] last:border-b-0">
                <td className="px-3 py-2.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{risk.riskRank ?? "·"}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[12px] text-[var(--ink)]">{pos.symbol}</span>
                  {pos.displayName && <span className="ml-2 text-[10px] text-[var(--ink-3)]">{pos.displayName}</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[10px] uppercase" style={{ color: pos.side === "long" ? LAB_MINT : LAB_PINK }}>
                  {pos.side}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">{pos.quantity.toLocaleString("en-US")}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">{fmtUsd(pos.entryPrice)}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{fmtUsd(pos.mark)}</span>
                  <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: pos.markSource === "entry_fallback" || pos.markSource === "none" ? LAB_AMBER : "var(--ink-3)" }}>
                    {markLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums" style={{ color: pnlColor }}>{fmtPct(pos.pnlPct)}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">{fmtUsdCompact(pos.exposure)}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                  {pos.weight === null ? "—" : `${Math.round(pos.weight * 100)}%`}
                </td>
                <td className="px-3 py-2.5" style={{ minWidth: 110 }}>
                  {risk.riskShare === null ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: LAB_AMBER }} title={risk.reasons.join(" · ")}>
                      unmodeled
                    </span>
                  ) : (
                    <div title={risk.reasons.join(" · ")}>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--depth-3)]">
                        <div className="h-full rounded-full" style={{ width: `${(risk.riskShare / maxShare) * 100}%`, background: risk.riskShare >= 0.35 ? LAB_PINK : LAB_ACCENT }} />
                      </div>
                      <span className="font-mono text-[9px] tabular-nums text-[var(--ink-3)]">{Math.round(risk.riskShare * 100)}%</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: trendColor }}>
                  {pos.trendVerdict ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={pos.thesisId ?? ""}
                    disabled={busy}
                    onChange={(e) => onLink(pos.id, e.target.value === "" ? null : Number(e.target.value))}
                    aria-label={`Link ${pos.symbol} to a thesis`}
                    className="max-w-[150px] rounded-[3px] border border-[var(--line)] bg-[var(--depth-2)] px-1.5 py-1 font-mono text-[9px] text-[var(--ink-2)] focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {theses.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title.slice(0, 24)} ({t.strength ?? "—"})
                      </option>
                    ))}
                  </select>
                  {risk.thesisStrength !== null && (
                    <span className="ml-1.5 font-mono text-[9px] tabular-nums" style={{ color: verdictColor(risk.thesisVerdict ?? "") }}>
                      {risk.thesisStrength}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onDelete(pos.id)}
                    disabled={busy}
                    aria-label={`Delete ${pos.symbol} position`}
                    className="font-mono text-[11px] text-[var(--ink-3)] transition-colors hover:text-[#a8496b]"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── add-position row ─────────────────────────────────────────── */

function AddPositionRow({
  busy,
  theses,
  onAdd,
  error,
}: {
  busy: boolean;
  theses: ThesisSummary[];
  onAdd: (i: { symbol: string; side: "long" | "short"; quantity: number; entryPrice: number; thesisId: number | null }) => Promise<boolean>;
  error: string;
}) {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [qty, setQty] = useState("");
  const [entry, setEntry] = useState("");
  const [thesisId, setThesisId] = useState("");

  const valid = symbol.trim().length > 0 && Number(qty) > 0 && Number(entry) >= 0;

  const submit = async () => {
    if (!valid || busy) return;
    const ok = await onAdd({
      symbol: symbol.trim().toUpperCase(),
      side,
      quantity: Number(qty),
      entryPrice: Number(entry),
      thesisId: thesisId === "" ? null : Number(thesisId),
    });
    if (ok) {
      setSymbol("");
      setQty("");
      setEntry("");
      setThesisId("");
    }
  };

  return (
    <div className="mt-3 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Add position · units × entry, marks resolve live</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol (WTI · GC=F · AAPL)"
          className="w-44 rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--line-2)] focus:outline-none"
        />
        <select
          value={side}
          onChange={(e) => setSide(e.target.value === "short" ? "short" : "long")}
          aria-label="Side"
          className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--ink-2)] focus:outline-none"
        >
          <option value="long">long</option>
          <option value="short">short</option>
        </select>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Qty"
          aria-label="Quantity"
          className="w-24 rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none"
        />
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Entry $"
          aria-label="Entry price"
          className="w-28 rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none"
        />
        <select
          value={thesisId}
          onChange={(e) => setThesisId(e.target.value)}
          aria-label="Link to thesis"
          className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2 py-1.5 font-mono text-[10px] text-[var(--ink-2)] focus:outline-none"
        >
          <option value="">thesis · none</option>
          {theses.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title.slice(0, 28)}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!valid || busy}
          className="rounded-[4px] px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed"
          style={{ background: valid && !busy ? LAB_ACCENT : "var(--depth-3)", color: valid && !busy ? "var(--depth-0)" : "var(--ink-3)" }}
        >
          {busy ? "…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px]" style={{ color: LAB_PINK }}>{error}</p>}
    </div>
  );
}

/* ── correlation panel ────────────────────────────────────────── */

function CorrelationPanel({ report }: { report: LabRiskReport }) {
  const c = report.correlation;
  return (
    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Correlation crowding</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">{c.detail}</p>
      {c.clusters.length > 0 && (
        <div className="mt-3 space-y-2">
          {c.clusters.map((cl, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ background: cl.combinedWeightPct >= 40 ? `${LAB_PINK}22` : "var(--depth-2)", color: cl.combinedWeightPct >= 40 ? LAB_PINK : "var(--ink-2)" }}>
                cluster · {cl.combinedWeightPct}% of gross
              </span>
              <span className="font-mono text-[11px] text-[var(--ink-2)]">{cl.symbols.join(" · ")}</span>
            </div>
          ))}
        </div>
      )}
      {c.highPairs.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
          {c.highPairs.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
              <span className="text-[var(--ink-2)]">{p.a} ↔ {p.b}</span>
              <span style={{ color: p.rho >= 0.85 ? LAB_PINK : LAB_AMBER }}>ρ {p.rho.toFixed(2)} <span className="text-[var(--ink-3)]">({p.observations}d)</span></span>
            </li>
          ))}
        </ul>
      )}
      {c.pairsUsed === 0 && c.clusters.length === 0 && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">No measurable pairs yet</p>
      )}
    </div>
  );
}

/* ── scenario totals panel ────────────────────────────────────── */

function ScenarioTotalsPanel({ report, thesis }: { report: LabRiskReport; thesis: { id: number; title: string } | null }) {
  const totals = SCENARIO_ORDER.map((id) => ({ id, t: report.scenarioTotals[id] })).filter((x) => x.t);
  const maxAbs = Math.max(...totals.map((x) => Math.abs(x.t!.total)), 1);
  return (
    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
        Book P&L across scenarios{thesis ? <> · thesis <span className="text-[var(--ink-2)]">"{thesis.title}"</span></> : ""}
      </p>
      {totals.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
          No scenario set — save a thesis in the pressure test and its scenarios price the whole book here.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {totals.map(({ id, t }) => {
            const v = t!.total;
            const color = v > 0 ? LAB_MINT : v < 0 ? LAB_PINK : "var(--ink-2)";
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="w-16 shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{SCENARIO_SHORT[id]}</span>
                <div className="relative h-3.5 flex-1">
                  <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[var(--line-2)]" />
                  <span
                    className="absolute inset-y-0 rounded-[2px]"
                    style={{
                      background: `${color}55`,
                      left: v < 0 ? `${50 - (Math.abs(v) / maxAbs) * 48}%` : "50%",
                      width: `${(Math.abs(v) / maxAbs) * 48}%`,
                    }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color }}>{fmtUsdCompact(v)}</span>
                {t!.unmodeled > 0 && (
                  <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.1em]" style={{ color: LAB_AMBER }} title={`${t!.unmodeled} position(s) had no β to the scenario driver`}>
                    +{t!.unmodeled} unmodeled
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 border-t border-[var(--line)] pt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">{report.scenarioBasis}</p>
    </div>
  );
}
