"use client";
/* ────────────────────────────────────────────────────────────────
   P·08 Bagholder Risk Map — the full workbench (heavy, lazy-loaded
   from the fullscreen view). Three-column layout per the architecture
   doc §7: narrative feed + curation form (left), trigger board grouped
   by state (center), evidence/scoring/playbook detail (right).

   Dense, terminal-style — mono uppercase tracked labels, honest-null
   "—" states, matching Chrome.tsx/Oil-Tracker aesthetic (doc §7).
──────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import {
  BAND_META, STATE_META, TAXONOMY_LABEL, BH_ACCENT,
  BoardEntry, LayerScoreView, TriggerStateId, TriggerTaxonomy, Timeframe, TriggerDirection,
  useBagholderBoard, submitNarrative, submitEvent, formatScore, formatDaysSince, coveragePct,
} from "./bagholder/bagholderData";
import RiskMapCanvas from "./bagholder/RiskMapCanvas";

const STATE_ORDER: TriggerStateId[] = ["LIVE_TRIGGER", "SETUP_FORMING", "WATCHLIST"];
const ARCHIVED_STATES: TriggerStateId[] = ["INVALIDATED", "EXPIRED"];

export default function BagholderRiskMapCore() {
  const board = useBagholderBoard();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const sorted = useMemo(
    () => [...board.entries].sort((a, b) => (b.latestSnapshot?.composite.final ?? -1) - (a.latestSnapshot?.composite.final ?? -1)),
    [board.entries],
  );
  const active = sorted.filter((e) => !ARCHIVED_STATES.includes(e.trigger.state));
  const archived = sorted.filter((e) => ARCHIVED_STATES.includes(e.trigger.state));
  const selected = sorted.find((e) => e.trigger.id === selectedId) ?? active[0] ?? null;

  const counts = {
    live: active.filter((e) => e.trigger.state === "LIVE_TRIGGER").length,
    forming: active.filter((e) => e.trigger.state === "SETUP_FORMING").length,
    watch: active.filter((e) => e.trigger.state === "WATCHLIST").length,
  };
  const aggCoverage = active.length
    ? Math.round(active.reduce((a, e) => a + (e.latestSnapshot ? coveragePct(e.latestSnapshot.coverage) : 0), 0) / active.length)
    : 0;
  const topEntry = active[0] ?? null;

  return (
    <div className="flex h-full flex-col gap-6">
      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Live triggers" value={String(counts.live)} color={BAND_META.live_trigger.color} />
        <SummaryCard label="Setups forming" value={String(counts.forming)} color={BAND_META.setup_forming.color} />
        <SummaryCard label="Watchlist" value={String(counts.watch)} color={BAND_META.watchlist.color} />
        <SummaryCard
          label="Coverage health"
          value={active.length ? `${aggCoverage}%` : "—"}
          color={aggCoverage >= 60 ? "var(--ink-2)" : BH_ACCENT}
          sub={topEntry ? `top: ${topEntry.narrative.headline.slice(0, 28)}` : undefined}
        />
      </div>

      {board.status === "error" && (
        <p className="rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] px-4 py-3 font-mono text-[11px] text-[var(--ink-2)]">
          {board.errorMessage}
        </p>
      )}

      {/* ── the risk map ── */}
      <div className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Risk map — pain × exhaustion, sized by opportunity</p>
        <RiskMapCanvas entries={active} selectedId={selected?.trigger.id ?? null} onSelect={setSelectedId} />
      </div>

      {/* ── three-column workbench ── */}
      <div className="grid flex-1 gap-4 md:grid-cols-[260px_1fr_320px]">
        {/* left — narrative feed + curation */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Narrative feed</p>
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)]"
            >
              {formOpen ? "− close" : "+ curate"}
            </button>
          </div>
          {formOpen && <AddNarrativeForm onDone={() => setFormOpen(false)} />}
          <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 520 }}>
            {sorted.length === 0 && board.status === "live" && (
              <p className="font-mono text-[10px] text-[var(--ink-3)]">No narratives tracked yet — curate one above.</p>
            )}
            {[...new Map(sorted.map((e) => [e.narrative.id, e.narrative])).values()].map((n) => (
              <div key={n.id} className="rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] p-2.5">
                <p className="text-[11px] leading-snug text-[var(--ink)]">{n.headline}</p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                  {n.category} · {n.primaryDirection} · {formatDaysSince(n.firstSeenAt)} old
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* center — trigger board */}
        <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 620 }}>
          {STATE_ORDER.map((state) => {
            const group = active.filter((e) => e.trigger.state === state);
            if (group.length === 0) return null;
            return (
              <div key={state} className="mb-2">
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: STATE_META[state].color }}>
                  {STATE_META[state].label} · {group.length}
                </p>
                <div className="flex flex-col gap-1.5">
                  {group.map((e) => (
                    <TriggerCard key={e.trigger.id} entry={e} selected={selected?.trigger.id === e.trigger.id} onClick={() => setSelectedId(e.trigger.id)} />
                  ))}
                </div>
              </div>
            );
          })}
          {archived.length > 0 && (
            <div>
              <button onClick={() => setArchivedOpen((v) => !v)} className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                {archivedOpen ? "−" : "+"} Invalidated / expired · {archived.length}
              </button>
              {archivedOpen && (
                <div className="flex flex-col gap-1.5">
                  {archived.map((e) => (
                    <TriggerCard key={e.trigger.id} entry={e} selected={selected?.trigger.id === e.trigger.id} onClick={() => setSelectedId(e.trigger.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
          {active.length === 0 && archived.length === 0 && board.status === "live" && (
            <p className="font-mono text-[10px] text-[var(--ink-3)]">No triggers yet.</p>
          )}
        </div>

        {/* right — evidence / scoring / playbook */}
        <div className="overflow-y-auto" style={{ maxHeight: 620 }}>
          {selected ? <DetailPanel entry={selected} /> : (
            <p className="font-mono text-[10px] text-[var(--ink-3)]">Select a trigger to see its scoring breakdown.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-[4px] border border-[var(--line)] bg-[var(--depth-1)] p-3" style={{ borderLeft: `2px solid ${color}` }}>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{label}</p>
      <p className="mt-1 text-xl font-semibold" style={{ color }}>{value}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{sub}</p>}
    </div>
  );
}

function TriggerCard({ entry, selected, onClick }: { entry: BoardEntry; selected: boolean; onClick: () => void }) {
  const { trigger, narrative, latestSnapshot } = entry;
  const color = STATE_META[trigger.state].color;
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1 rounded-[3px] border px-3 py-2 text-left transition-colors"
      style={{ borderColor: selected ? color : "var(--line)", background: selected ? "var(--depth-2)" : "var(--depth-1)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em]" style={{ color }}>{TAXONOMY_LABEL[trigger.taxonomy as TriggerTaxonomy] ?? trigger.taxonomy}</span>
        <span className="font-mono text-[11px] font-semibold text-[var(--ink)]">{latestSnapshot ? formatScore(latestSnapshot.composite.final) : "—"}</span>
      </div>
      <p className="truncate text-[11px] text-[var(--ink)]">{narrative.headline}</p>
      <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
        <span>{trigger.primarySymbol ?? "—"}</span>
        <span>·</span>
        <span>{trigger.direction ?? "—"}</span>
        <span>·</span>
        <span>{trigger.timeframe}</span>
      </div>
    </button>
  );
}

function ScoreBar({ label, layer }: { label: string; layer: LayerScoreView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{label}</span>
        <span className="font-mono text-[10px] text-[var(--ink-2)]">
          {formatScore(layer.score)}/100 · {coveragePct(layer.coverage)}% cov
        </span>
      </button>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--depth-2)]">
        <div className="h-full rounded-full" style={{ width: `${layer.score}%`, background: BH_ACCENT }} />
      </div>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-[var(--line)] pl-2">
          {layer.components.map((c) => (
            <li key={c.key} className="font-mono text-[9px] leading-relaxed text-[var(--ink-3)]">
              <span style={{ color: c.effect > 0 ? "var(--ink-2)" : c.effect < 0 ? BH_ACCENT : "var(--ink-3)" }}>
                {c.effect > 0 ? "+" : ""}{c.effect}
              </span>{" "}
              {c.label} — {c.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailPanel({ entry }: { entry: BoardEntry }) {
  const { trigger, narrative, latestSnapshot } = entry;
  const [eventOpen, setEventOpen] = useState(false);
  if (!latestSnapshot) {
    return <p className="font-mono text-[10px] text-[var(--ink-3)]">No scoring cycle has run for this trigger yet.</p>;
  }
  const { layers, composite } = latestSnapshot;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: STATE_META[trigger.state].color }}>
          {STATE_META[trigger.state].label} · {TAXONOMY_LABEL[trigger.taxonomy as TriggerTaxonomy] ?? trigger.taxonomy}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">{narrative.headline}</p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
          {narrative.category} · first seen {formatDaysSince(narrative.firstSeenAt)} ago
        </p>
      </div>

      <div className="rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Composite</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold" style={{ color: BAND_META[composite.band].color }}>{formatScore(composite.final)}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{BAND_META[composite.band].label}</span>
        </p>
        <p className="mt-1 font-mono text-[9px] text-[var(--ink-3)]">
          raw {formatScore(composite.raw)} × {composite.confidenceMultiplier.toFixed(2)} confidence = {formatScore(composite.final)}
        </p>
      </div>

      <div>
        <ScoreBar label="Macro (M)" layer={layers.macro} />
        <ScoreBar label="Narrative exhaustion (N)" layer={layers.narrative} />
        <ScoreBar label="Positioning / pain (P)" layer={layers.positioning} />
        <ScoreBar label="Opportunity (O)" layer={layers.opportunity} />
        <ScoreBar label="Confidence (C)" layer={layers.confidence} />
      </div>

      <div className="rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Playbook</p>
        <p className="mt-1.5 text-[11px] text-[var(--ink-2)]">Symbol: {trigger.primarySymbol ?? "—"} · Direction: {trigger.direction ?? "—"}</p>
        <p className="mt-3 font-mono text-[9px] leading-relaxed text-[var(--ink-3)]">
          This module scores setups. Sizing stays a human decision — a live-trigger score is not a conviction level.
        </p>
      </div>

      <div>
        <button onClick={() => setEventOpen((v) => !v)} className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)]">
          {eventOpen ? "− close" : "+ log a new reply/event"}
        </button>
        {eventOpen && <AddEventForm narrativeId={narrative.id} onDone={() => setEventOpen(false)} />}
      </div>
    </div>
  );
}

/* ── curation forms ────────────────────────────────────────────── */

const inputClass = "w-full rounded-[3px] border border-[var(--line)] bg-[var(--depth-0)] px-2 py-1.5 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--line-2)]";
const labelClass = "font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]";

function AddNarrativeForm({ onDone }: { onDone: () => void }) {
  const [headline, setHeadline] = useState("");
  const [firstSeenAt, setFirstSeenAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("CRYPTO");
  const [primaryDirection, setPrimaryDirection] = useState("mixed");
  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState("CRYPTO");
  const [taxonomy, setTaxonomy] = useState<TriggerTaxonomy>("LATE_NARRATIVE_FADE");
  const [direction, setDirection] = useState<TriggerDirection>("no_trade");
  const [timeframe, setTimeframe] = useState<Timeframe>("SWING");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (headline.trim().length < 8 || !symbol.trim()) {
      setError("headline (≥8 chars) and a symbol are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { ok, body } = await submitNarrative({
      headline,
      firstSeenAt: new Date(firstSeenAt).toISOString(),
      category,
      primaryDirection,
      assets: [{ symbol, displayName: symbol, assetClass, role: "UNDERLYING", exposureType: "DIRECT", impliedDirection: direction === "short" ? "short" : "long" }],
      trigger: { taxonomy, direction, primarySymbol: symbol, timeframe },
    });
    setSubmitting(false);
    if (!ok) {
      setError(typeof body.error === "string" ? body.error : "submission failed");
      return;
    }
    onDone();
  };

  return (
    <div className="flex flex-col gap-2 rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
      <div>
        <p className={labelClass}>Headline</p>
        <input className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. BTC energy-reallocation-to-AI narrative" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={labelClass}>First seen</p>
          <input type="date" className={inputClass} value={firstSeenAt} onChange={(e) => setFirstSeenAt(e.target.value)} />
        </div>
        <div>
          <p className={labelClass}>Category</p>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {["CRYPTO", "EQUITY", "MACRO", "COMMODITY", "CROSS_ASSET"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className={labelClass}>Direction (narrative)</p>
          <select className={inputClass} value={primaryDirection} onChange={(e) => setPrimaryDirection(e.target.value)}>
            {["bullish", "bearish", "mixed"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <p className={labelClass}>Asset class</p>
          <select className={inputClass} value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
            {["CRYPTO", "MINER_EQUITY", "AI_INFRA_EQUITY", "MACRO_PROXY", "COMMODITY", "EQUITY"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className={labelClass}>Primary symbol</p>
        <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTC-USD" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className={labelClass}>Taxonomy</p>
          <select className={inputClass} value={taxonomy} onChange={(e) => setTaxonomy(e.target.value as TriggerTaxonomy)}>
            {Object.keys(TAXONOMY_LABEL).map((t) => <option key={t} value={t}>{TAXONOMY_LABEL[t as TriggerTaxonomy]}</option>)}
          </select>
        </div>
        <div>
          <p className={labelClass}>Trade direction</p>
          <select className={inputClass} value={direction} onChange={(e) => setDirection(e.target.value as TriggerDirection)}>
            {["long", "short", "pair", "basket", "no_trade"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <p className={labelClass}>Timeframe</p>
          <select className={inputClass} value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
            {["INTRADAY", "SWING", "MULTI_WEEK"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="font-mono text-[9px] text-[var(--ink-2)]">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="mt-1 rounded-[3px] border border-[var(--line-2)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)] transition-colors hover:border-[var(--ink-2)] disabled:opacity-50"
      >
        {submitting ? "Scoring…" : "Track narrative + score now"}
      </button>
    </div>
  );
}

function AddEventForm({ narrativeId, onDone }: { narrativeId: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [agree, setAgree] = useState(0);
  const [disagree, setDisagree] = useState(0);
  const [reframe, setReframe] = useState(0);
  const [hedge, setHedge] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await submitEvent(narrativeId, {
      postedAt: new Date().toISOString(),
      author: author || null,
      text: text || null,
      replyAgree: agree,
      replyDisagree: disagree,
      replyReframe: reframe,
      hedgeDetected: hedge,
    });
    setSubmitting(false);
    onDone();
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[3px] border border-[var(--line)] bg-[var(--depth-1)] p-3">
      <input className={inputClass} placeholder="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <textarea className={inputClass} placeholder="reply theme / note" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" min={0} className={inputClass} placeholder="agree" value={agree} onChange={(e) => setAgree(Number(e.target.value))} />
        <input type="number" min={0} className={inputClass} placeholder="disagree" value={disagree} onChange={(e) => setDisagree(Number(e.target.value))} />
        <input type="number" min={0} className={inputClass} placeholder="reframe" value={reframe} onChange={(e) => setReframe(Number(e.target.value))} />
      </div>
      <label className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
        <input type="checkbox" checked={hedge} onChange={(e) => setHedge(e.target.checked)} /> hedge language detected
      </label>
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded-[3px] border border-[var(--line-2)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)] hover:border-[var(--ink-2)] disabled:opacity-50"
      >
        {submitting ? "Rescoring…" : "Add event + rescore"}
      </button>
    </div>
  );
}
