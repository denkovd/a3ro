"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 stage 1 — Thesis Pressure Test.
   Input panel (thesis text + optional direction/instrument/horizon
   overrides) → verdict header with the FULL strength math one click
   away → assumptions WEAKEST FIRST, each expandable to its receipts:
   scoring reasons, live-data cross-checks, the counter-case, and the
   evidence that would kill it. Fake-confidence claims are branded.
   Every number in this stage traces to a visible line — no black box.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";
import {
  apiAnalyze,
  apiDeleteThesis,
  apiGetThesis,
  apiListTheses,
  confidenceColor,
  fragilityColor,
  verdictColor,
  fmtUsd,
  KIND_LABEL,
  LAB_ACCENT,
  LAB_AMBER,
  LAB_MINT,
  LAB_PINK,
  type LabAssumption,
  type LabResult,
  type ThesisSummary,
} from "./thesisData";

const EXAMPLE_BODY =
  "WTI is going to $95 by September. OPEC cuts are holding and EIA inventories drew 4 Mbbl last week. China demand is recovering. Positioning has room because funds are not crowded long yet. The dollar can't rally with the Fed cutting.";

type RunState = { status: "idle" | "running" | "done" | "error"; error?: string; setup?: boolean };

const INSTRUMENTS = ["", "WTI", "BRENT", "GC=F", "SI=F", "BTC-USD", "ETH-USD", "^GSPC", "^NDX", "NG=F", "DX-Y.NYB"] as const;

export default function PressureTest({
  result,
  onResult,
  onOpenScenarios,
}: {
  result: LabResult | null;
  onResult: (r: LabResult | null) => void;
  onOpenScenarios: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [direction, setDirection] = useState("");
  const [instrument, setInstrument] = useState("");
  const [horizon, setHorizon] = useState("");
  const [save, setSave] = useState(true);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [saved, setSaved] = useState<ThesisSummary[]>([]);
  const [savedStatus, setSavedStatus] = useState<"loading" | "live" | "empty" | "error" | "setup">("loading");

  const refreshSaved = useCallback(() => {
    let alive = true;
    apiListTheses().then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setSavedStatus(r.setup ? "setup" : "error");
        return;
      }
      setSaved(r.data);
      setSavedStatus(r.data.length ? "live" : "empty");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => refreshSaved(), [refreshSaved]);

  const analyze = useCallback(async () => {
    if (body.trim().length < 20 || run.status === "running") return;
    setRun({ status: "running" });
    const r = await apiAnalyze({
      title: title.trim() || "Untitled thesis",
      body: body.trim(),
      ...(direction ? { direction } : {}),
      ...(instrument ? { instrument } : {}),
      ...(horizon && Number(horizon) > 0 ? { horizonDays: Number(horizon) } : {}),
      save,
    });
    if (!r.ok) {
      setRun({ status: "error", error: r.error, setup: r.setup });
      return;
    }
    onResult(r.data);
    setRun({ status: "done" });
    if (save) refreshSaved();
  }, [title, body, direction, instrument, horizon, save, run.status, onResult, refreshSaved]);

  const loadSaved = useCallback(
    async (id: number) => {
      setRun({ status: "running" });
      const r = await apiGetThesis(id);
      if (!r.ok) {
        setRun({ status: "error", error: r.error });
        return;
      }
      onResult(r.data);
      setRun({ status: "done" });
    },
    [onResult],
  );

  const removeSaved = useCallback(
    async (id: number) => {
      const r = await apiDeleteThesis(id);
      if (r.ok) {
        if (result?.thesisId === id) onResult(result ? { ...result, thesisId: null } : null);
        refreshSaved();
      }
    },
    [refreshSaved, result, onResult],
  );

  const a = result?.analysis ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      {/* ── input column ── */}
      <div>
        <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            01 · State the thesis
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title — e.g. Long WTI into September"
            className="mt-4 w-full rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--line-2)] focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write it the way you'd say it — claims, reasons, levels, deadlines. The engine extracts and pressure-tests every assumption, stated or implied."
            rows={9}
            className="mt-3 w-full resize-y rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--line-2)] focus:outline-none"
          />

          {/* overrides */}
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Overrides — optional, else inferred from the text
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              aria-label="Direction override"
              className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--ink-2)] focus:outline-none"
            >
              <option value="">dir · auto</option>
              <option value="long">long</option>
              <option value="short">short</option>
              <option value="neutral">neutral</option>
            </select>
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              aria-label="Instrument override"
              className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--ink-2)] focus:outline-none"
            >
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i === "" ? "inst · auto" : i}
                </option>
              ))}
            </select>
            <input
              value={horizon}
              onChange={(e) => setHorizon(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="days · auto"
              aria-label="Horizon override (days)"
              className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--ink-2)] placeholder:text-[var(--ink-3)] focus:outline-none"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[#62d9e8]" />
              Save for risk audit
            </label>
            <button
              onClick={analyze}
              disabled={body.trim().length < 20 || run.status === "running"}
              className="rounded-[4px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)] disabled:cursor-not-allowed"
              style={{
                background: body.trim().length >= 20 && run.status !== "running" ? LAB_ACCENT : "var(--depth-3)",
                color: body.trim().length >= 20 && run.status !== "running" ? "var(--depth-0)" : "var(--ink-3)",
              }}
            >
              {run.status === "running" ? "Testing…" : "Pressure test"}
            </button>
          </div>
          {body.trim().length < 20 && body.length > 0 && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Keep going — 20 chars minimum</p>
          )}
          {run.status === "error" && (
            <p className="mt-3 rounded-[4px] border px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: LAB_PINK, color: LAB_PINK }}>
              {run.setup ? "Setup needed: " : ""}
              {run.error}
            </p>
          )}
          <button
            onClick={() => {
              setTitle("Long WTI into September");
              setBody(EXAMPLE_BODY);
            }}
            className="sweep mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            Load example thesis
          </button>
        </div>

        {/* saved theses */}
        <div className="mt-6 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Saved theses</p>
          {savedStatus === "loading" && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Loading…</p>}
          {savedStatus === "setup" && (
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              Tables not migrated yet — run <span className="font-mono text-[var(--ink-2)]">npm run migrate:thesis</span> in backend/. Analysis still works; saving needs the table.
            </p>
          )}
          {savedStatus === "error" && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Feed unreachable</p>}
          {savedStatus === "empty" && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">None yet — saved runs land here</p>}
          {savedStatus === "live" && (
            <ul className="mt-3 space-y-2">
              {saved.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2">
                  <button
                    onClick={() => loadSaved(t.id)}
                    className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                    title={`Load "${t.title}"`}
                  >
                    {t.title}
                  </button>
                  {t.strength !== null && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: verdictColor(t.verdict ?? "") }}>
                      {t.strength}
                    </span>
                  )}
                  <button
                    onClick={() => removeSaved(t.id)}
                    aria-label={`Delete "${t.title}"`}
                    className="shrink-0 font-mono text-[10px] text-[var(--ink-3)] transition-colors hover:text-[#a8496b]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── results column ── */}
      <div>
        {!a && run.status !== "running" && (
          <div className="flex min-h-[300px] items-center justify-center rounded-[5px] border border-dashed border-[var(--line)] p-8">
            <div className="max-w-md text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">No thesis under test</p>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-3)]">
                Write the trade as you'd argue it. The engine extracts every claim, infers the assumptions you didn't state,
                scores confidence against evidence, and checks each leg against the live tape, macro regime, positioning and trend state.
              </p>
            </div>
          </div>
        )}
        {run.status === "running" && !a && (
          <div className="flex min-h-[300px] items-center justify-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Extracting assumptions · reading the tape…</p>
          </div>
        )}
        {a && (
          <>
            <VerdictHeader result={result as LabResult} onOpenScenarios={onOpenScenarios} />
            <AssumptionList assumptions={a.assumptions} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── verdict header ───────────────────────────────────────────── */

function VerdictHeader({ result, onOpenScenarios }: { result: LabResult; onOpenScenarios: () => void }) {
  const a = result.analysis;
  const [showMath, setShowMath] = useState(false);
  const color = verdictColor(a.verdict);
  return (
    <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="text-4xl font-semibold tabular-nums tracking-tight" style={{ color }}>
          {a.strength}
        </span>
        <span className="font-mono text-[12px] uppercase tracking-[0.25em]" style={{ color }}>
          {a.verdict}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {a.direction} · {a.instrumentLabel} · {a.horizonDays}d{a.targetPrice !== null ? ` · target ${fmtUsd(a.targetPrice)}` : ""}
          {result.thesisId !== null ? ` · saved #${result.thesisId}` : ""}
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--ink-2)]">{a.headline}</p>
      {result.notice && (
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed" style={{ color: LAB_AMBER }}>
          {result.notice}
        </p>
      )}

      {/* context coverage chips — what was actually checked live */}
      <div className="mt-4 flex flex-wrap gap-2">
        {a.contextCoverage.map((c) => (
          <span
            key={c.source}
            title={c.detail}
            className="flex items-center gap-1.5 rounded-[3px] border border-[var(--line)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]"
          >
            <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: c.live ? LAB_MINT : "var(--depth-3)", border: c.live ? "none" : "1px solid var(--line-2)" }} />
            {c.source}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          onClick={() => setShowMath((v) => !v)}
          className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          {showMath ? "Hide the math" : "Show the math"}
        </button>
        <button
          onClick={onOpenScenarios}
          className="font-mono text-[10px] uppercase tracking-[0.25em] transition-colors"
          style={{ color: LAB_ACCENT }}
        >
          Run scenarios →
        </button>
      </div>

      {showMath && (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Strength = 50 base + listed components, clamped 2–98. Nothing unlisted.
          </p>
          <ul className="mt-3 space-y-1.5">
            {a.strengthComponents.map((c) => (
              <li key={c.key} className="flex items-baseline gap-3">
                <span
                  className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums"
                  style={{ color: c.effect > 0 ? LAB_MINT : c.effect < 0 ? LAB_PINK : "var(--ink-3)" }}
                >
                  {c.effect > 0 ? `+${c.effect}` : c.effect}
                </span>
                <span className="w-36 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">{c.label}</span>
                <span className="text-[11px] leading-relaxed text-[var(--ink-3)]">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── assumptions (weakest first) ──────────────────────────────── */

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--depth-3)]">
      <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color }} />
    </div>
  );
}

function AssumptionList({ assumptions }: { assumptions: LabAssumption[] }) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Assumptions · weakest first
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          {assumptions.length} legs · {assumptions.filter((x) => x.origin === "implied").length} implied · {assumptions.filter((x) => x.fakeConfidence).length} fake-confidence
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {assumptions.map((asm, i) => (
          <AssumptionCard key={asm.id} asm={asm} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function AssumptionCard({ asm, rank }: { asm: LabAssumption; rank: number }) {
  const [open, setOpen] = useState(false);
  const fColor = fragilityColor(asm.fragility);
  return (
    <div
      className="overflow-hidden rounded-[5px] border bg-[var(--depth-1)] transition-colors"
      style={{ borderColor: asm.fragility >= 70 ? `${LAB_PINK}55` : "var(--line)" }}
    >
      <button onClick={() => setOpen((v) => !v)} className="block w-full p-4 text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{String(rank).padStart(2, "0")}</span>
          <span className="rounded-[3px] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
            {KIND_LABEL[asm.kind] ?? asm.kind}
          </span>
          <span
            className="rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]"
            style={{
              background: asm.origin === "implied" ? "rgba(139,157,255,0.12)" : "var(--depth-2)",
              color: asm.origin === "implied" ? "#8b9dff" : "var(--ink-3)",
            }}
          >
            {asm.origin}
          </span>
          {asm.fakeConfidence && (
            <span className="rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ background: LAB_PINK, color: "var(--depth-0)" }}>
              Fake confidence
            </span>
          )}
          {asm.checks.some((c) => c.verdict === "contradicts") && (
            <span className="rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ background: `${LAB_AMBER}22`, color: LAB_AMBER }}>
              Tape disagrees
            </span>
          )}
          <span aria-hidden className="ml-auto font-mono text-[10px] text-[var(--ink-3)]">{open ? "−" : "+"}</span>
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--ink)]">{asm.text}</p>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Fragility</span>
              <span className="font-mono text-[11px] tabular-nums" style={{ color: fColor }}>{asm.fragility}</span>
            </div>
            <div className="mt-1"><Bar value={asm.fragility} color={fColor} /></div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Assessed confidence</span>
              <span className="font-mono text-[11px] tabular-nums" style={{ color: confidenceColor(asm.confidence) }}>{asm.confidence}</span>
            </div>
            <div className="mt-1"><Bar value={asm.confidence} color={confidenceColor(asm.confidence)} /></div>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--line)] px-4 pb-4">
          {(asm.statedConfidence !== null || asm.evidenceScore !== null) && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
              Language: stated {asm.statedConfidence ?? "—"} · evidence {asm.evidenceScore ?? "—"}
              {asm.certaintyMarkers.length > 0 && <> · certainty: {asm.certaintyMarkers.join(", ")}</>}
              {asm.hedgeMarkers.length > 0 && <> · hedges: {asm.hedgeMarkers.join(", ")}</>}
            </p>
          )}

          {/* live checks */}
          {asm.checks.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {asm.checks.map((c, i) => (
                <div key={i} className="flex items-baseline gap-2 text-[11px] leading-relaxed">
                  <span
                    aria-hidden
                    className="mt-[3px] inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{
                      background: c.verdict === "supports" ? LAB_MINT : c.verdict === "contradicts" ? LAB_PINK : c.verdict === "no_data" ? "var(--depth-3)" : LAB_AMBER,
                      border: c.verdict === "no_data" ? "1px solid var(--line-2)" : "none",
                    }}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{c.source}</span>
                  <span className="text-[var(--ink-2)]">
                    needs <em className="not-italic text-[var(--ink)]">{c.claimExpects}</em> — {c.marketReads}
                    {c.effect !== 0 && (
                      <span className="font-mono tabular-nums" style={{ color: c.effect > 0 ? LAB_MINT : LAB_PINK }}> ({c.effect > 0 ? "+" : ""}{c.effect})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* scoring receipts */}
          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] hover:text-[var(--ink-2)]">
              Scoring receipts ({asm.reasons.length})
            </summary>
            <ul className="mt-2 space-y-1 border-l border-[var(--line)] pl-3">
              {asm.reasons.map((r, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-[var(--ink-3)]">{r}</li>
              ))}
            </ul>
          </details>

          {/* counter-case */}
          <div className="mt-4 rounded-[4px] border px-3 py-2.5" style={{ borderColor: `${LAB_PINK}44`, background: `${LAB_PINK}0d` }}>
            <p className="font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: LAB_PINK }}>Strongest counter-case</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{asm.counterCase}</p>
          </div>

          {/* kill evidence */}
          <div className="mt-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">What would kill this leg</p>
            <ul className="mt-1.5 space-y-1">
              {asm.killEvidence.map((k, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
                  <span aria-hidden className="font-mono text-[10px]" style={{ color: LAB_AMBER }}>▸</span>
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
