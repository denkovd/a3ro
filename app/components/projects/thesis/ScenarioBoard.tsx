"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 stage 2 — Scenario Board.
   Five columns, DOWNSIDE FIRST (bear tail leftmost — the product
   rule: the reader meets what hurts before what pays). Price legs
   at documented σ-multiples of the instrument's own realized vol;
   probabilities are labeled empirical frequencies, never forecasts.
   Below the board: the assumption × scenario survival matrix — every
   cell traces scenario damage back to the exact leg that failed.
──────────────────────────────────────────────────────────────── */
import { useState } from "react";
import {
  fmtPct,
  fmtUsd,
  KIND_LABEL,
  LAB_ACCENT,
  LAB_AMBER,
  LAB_MINT,
  LAB_PINK,
  outcomeColor,
  type LabResult,
  type LabScenario,
  type OutcomeState,
} from "./thesisData";

const STATE_GLYPH: Record<OutcomeState, string> = { holds: "●", stressed: "◐", breaks: "○" };
const STATE_LABEL: Record<OutcomeState, string> = { holds: "holds", stressed: "stressed", breaks: "breaks" };

export default function ScenarioBoard({ result, onBack }: { result: LabResult | null; onBack: () => void }) {
  if (!result) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-[5px] border border-dashed border-[var(--line)] p-8">
        <div className="max-w-md text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">No thesis under test</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-3)]">
            Scenarios are generated FROM a pressure-tested thesis — its instrument, horizon, realized vol and assumption set.
          </p>
          <button onClick={onBack} className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: LAB_ACCENT }}>
            ← Run a pressure test first
          </button>
        </div>
      </div>
    );
  }
  const s = result.scenarios;
  const a = result.analysis;

  return (
    <div>
      {/* basis strip — where every number comes from */}
      <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {s.instrument} · {s.horizonDays}d horizon
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-2)]">
            anchor {fmtUsd(s.anchorPrice)} <span className="text-[var(--ink-3)]">({s.anchorSource})</span>
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
          σ basis: {s.sigmaBasis}. {s.probabilityNote}
        </p>
      </div>

      {/* the five columns — downside first */}
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {s.scenarios.map((sc) => (
          <ScenarioColumn key={sc.id} sc={sc} direction={a.direction} />
        ))}
      </div>

      {/* survival matrix */}
      <SurvivalMatrix result={result} />
    </div>
  );
}

function ScenarioColumn({ sc, direction }: { sc: LabScenario; direction: string }) {
  const broken = sc.outcomes.filter((o) => o.state === "breaks").length;
  const stressed = sc.outcomes.filter((o) => o.state === "stressed").length;
  const holds = sc.outcomes.filter((o) => o.state === "holds").length;
  const isTail = Math.abs(sc.sigma) >= 2.5;
  const pnlColor = sc.thesisPnlPct === null ? "var(--ink-3)" : sc.thesisPnlPct > 0 ? LAB_MINT : sc.thesisPnlPct < 0 ? LAB_PINK : LAB_AMBER;
  const headColor = sc.sigma < 0 ? LAB_PINK : sc.sigma > 0 ? LAB_MINT : "var(--ink-2)";

  return (
    <div
      className="flex flex-col rounded-[5px] border bg-[var(--depth-1)] p-4"
      style={{ borderColor: isTail ? `${headColor}44` : "var(--line)" }}
    >
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: headColor }}>
          {sc.name}
        </p>
        <p className="font-mono text-[9px] tabular-nums text-[var(--ink-3)]">{sc.sigma > 0 ? `+${sc.sigma}` : sc.sigma}σ</p>
      </div>

      <p className="mt-3 text-xl font-semibold tabular-nums tracking-tight text-[var(--ink)]">{fmtUsd(sc.price)}</p>
      <p className="font-mono text-[10px] tabular-nums" style={{ color: headColor }}>{fmtPct(sc.movePct)}</p>

      {/* empirical probability */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Hist. freq</span>
          <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]" title={sc.probabilityBasis}>
            {sc.probability === null ? "—" : `${(sc.probability * 100).toFixed(1)}%`}
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--depth-3)]">
          <div className="h-full rounded-full" style={{ width: `${Math.min((sc.probability ?? 0) * 100 * 2.2, 100)}%`, background: "var(--ink-3)" }} />
        </div>
      </div>

      {/* thesis P&L */}
      <div className="mt-3 flex items-baseline justify-between border-t border-[var(--line)] pt-3">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Thesis ({direction})</span>
        <span className="font-mono text-[13px] tabular-nums" style={{ color: pnlColor }}>{fmtPct(sc.thesisPnlPct)}</span>
      </div>

      {/* leg survival mini-read */}
      <div className="mt-2 flex items-center gap-3 font-mono text-[9px] tabular-nums">
        <span style={{ color: LAB_PINK }}>{broken} break</span>
        <span style={{ color: LAB_AMBER }}>{stressed} stress</span>
        <span style={{ color: LAB_MINT }}>{holds} hold</span>
      </div>

      <p className="mt-3 flex-1 text-[11px] leading-relaxed text-[var(--ink-3)]">{sc.narrative}</p>
      <p className="mt-3 border-t border-[var(--line)] pt-2.5 text-[11px] leading-relaxed text-[var(--ink-2)]">{sc.thesisImpact}</p>
    </div>
  );
}

/* ── assumption × scenario matrix ─────────────────────────────── */

function SurvivalMatrix({ result }: { result: LabResult }) {
  const { analysis: a, scenarios: s } = result;
  const [focus, setFocus] = useState<{ aid: string; sid: string } | null>(null);

  const focused =
    focus === null
      ? null
      : (() => {
          const sc = s.scenarios.find((x) => x.id === focus.sid);
          const oc = sc?.outcomes.find((o) => o.assumptionId === focus.aid);
          const asm = a.assumptions.find((x) => x.id === focus.aid);
          return sc && oc && asm ? { sc, oc, asm } : null;
        })();

  return (
    <div className="mt-6 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Where the thesis breaks · assumption × scenario
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          <span style={{ color: LAB_MINT }}>● holds</span> · <span style={{ color: LAB_AMBER }}>◐ stressed</span> · <span style={{ color: LAB_PINK }}>○ breaks</span> · click a cell for the why
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="pb-2 pr-4 text-left font-mono text-[9px] font-normal uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Assumption (weakest first)
              </th>
              {s.scenarios.map((sc) => (
                <th key={sc.id} className="pb-2 text-center font-mono text-[9px] font-normal uppercase tracking-[0.15em]" style={{ color: sc.sigma < 0 ? LAB_PINK : sc.sigma > 0 ? LAB_MINT : "var(--ink-3)" }}>
                  {sc.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.assumptions.map((asm) => (
              <tr key={asm.id} className="border-t border-[var(--line)]">
                <td className="max-w-[320px] py-2 pr-4">
                  <span className="mr-2 rounded-[3px] border border-[var(--line)] px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {KIND_LABEL[asm.kind] ?? asm.kind}
                  </span>
                  <span className="text-[11px] leading-snug text-[var(--ink-2)]">
                    {asm.text.length > 90 ? `${asm.text.slice(0, 90)}…` : asm.text}
                  </span>
                </td>
                {s.scenarios.map((sc) => {
                  const oc = sc.outcomes.find((o) => o.assumptionId === asm.id);
                  const st = oc?.state ?? "stressed";
                  const active = focus?.aid === asm.id && focus?.sid === sc.id;
                  return (
                    <td key={sc.id} className="py-2 text-center">
                      <button
                        onClick={() => setFocus(active ? null : { aid: asm.id, sid: sc.id })}
                        title={oc?.why ?? ""}
                        aria-label={`${asm.kind} in ${sc.name}: ${STATE_LABEL[st]}`}
                        className="rounded-[3px] px-2 py-0.5 font-mono text-[13px] transition-colors"
                        style={{
                          color: outcomeColor(st),
                          background: active ? "var(--depth-3)" : "transparent",
                        }}
                      >
                        {STATE_GLYPH[st]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {focused && (
        <div className="mt-3 rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: outcomeColor(focused.oc.state) }}>
            {focused.sc.name} · {KIND_LABEL[focused.asm.kind] ?? focused.asm.kind} · {STATE_LABEL[focused.oc.state]}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{focused.oc.why}</p>
        </div>
      )}
    </div>
  );
}
