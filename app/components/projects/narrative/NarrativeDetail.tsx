"use client";
/* ────────────────────────────────────────────────────────────────
   Narrative Rotation — per-narrative detail: input log, every score
   contribution (mirrors Thesis Lab's reasons[] pattern — nothing in
   the score panel that doesn't trace to a listed row), and the
   market-corroboration panel. Symbol chips link out to the member's
   row in Bull Market Finder (?symbol= — see the small addition in
   that view). Relative-Strength doesn't exist yet (Task 1 of
   PLAN-frontend-intelligence-modules.md is unbuilt) so that half of
   the promised cross-link is intentionally absent for now.
──────────────────────────────────────────────────────────────── */
import Link from "next/link";
import {
  NARR_MUTED_PINK,
  fmtScore,
  fmtRs,
  fmtPctBullish,
  scoreColor,
  daysSince,
  formatStaleness,
  type NarrativeBoardRow,
} from "./narrativeData";
import type { AttentionDatapoint, Window } from "./narrativeScoring";
import type { StoredDatapoint } from "./narrativeStore";
import AttentionInputForm from "./AttentionInputForm";

const WINDOW_LABEL: Record<Window, string> = { "1d": "1 day", "1w": "1 week", "1m": "1 month" };

export default function NarrativeDetail({
  row,
  log,
  onAdd,
  onDelete,
  onClose,
}: {
  row: NarrativeBoardRow;
  log: StoredDatapoint[];
  onAdd: (datapoints: AttentionDatapoint[]) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { def, scoreRow, corroboration, lastInputDate } = row;
  const insufficient = scoreRow.status === "insufficient_data";
  const stale = daysSince(lastInputDate);
  const narrativeLog = [...log].filter((d) => d.narrativeId === def.id).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="rounded-sm border border-[var(--line)] bg-[var(--depth-1)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">{def.id}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--ink)]">{def.label}</h2>
          <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-[var(--ink-3)]">{def.notes}</p>
        </div>
        <button
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
        >
          Close ×
        </button>
      </div>

      {/* member symbols — link out to Bull Market Finder's row */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {def.symbols.map((s) => (
          <Link
            key={s}
            href={`/Projects/Bull-Market-Finder?symbol=${encodeURIComponent(s)}`}
            className="rounded-[2px] border border-[var(--line)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)] hover:text-[var(--ink)]"
          >
            {s}
          </Link>
        ))}
      </div>

      {/* score + market corroboration side by side */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-sm border border-[var(--line)] p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Attention score</p>
          <p className="mt-2 font-mono text-2xl tabular-nums" style={{ color: insufficient ? "var(--ink-3)" : scoreColor(scoreRow.score) }}>
            {insufficient ? "insufficient_data" : fmtScore(scoreRow.score)}
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {scoreRow.inputCount} input{scoreRow.inputCount === 1 ? "" : "s"} ·{" "}
            <span style={{ color: stale !== null && stale > 7 ? NARR_MUTED_PINK : "var(--ink-3)" }}>{formatStaleness(stale)}</span>
          </p>
        </div>

        <div className="rounded-sm border border-[var(--line)] p-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Market corroboration</p>
          <div className="mt-2 flex items-baseline gap-5">
            <span className="font-mono text-lg tabular-nums text-[var(--ink)]">{fmtRs(corroboration.medianRs63)}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">median RS63</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-5">
            <span className="font-mono text-lg tabular-nums text-[var(--ink)]">{fmtPctBullish(corroboration.pctBullish)}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              bullish · {corroboration.matchedCount}/{corroboration.totalSymbols} matched in scan universe
            </span>
          </div>
        </div>
      </div>

      {/* contributions — mirrors Thesis Lab's reasons[] pattern: every
          number in the score above traces to one of these rows. */}
      <div className="mt-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Score contributions</p>
        {scoreRow.contributions.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--ink-3)]">
            {insufficient
              ? "Not enough fed data yet — feed at least 3 datapoints across metrics with matching dates from at least one other narrative to unlock cross-sectional scoring."
              : "No contributions."}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {scoreRow.contributions.map((c) => (
              <div
                key={`${c.metric}-${c.window}`}
                className="grid grid-cols-[5.5rem_5rem_1fr_4rem_4rem_4.5rem] items-baseline gap-2 border-b border-[var(--line)] py-2 font-mono text-[10px] tabular-nums"
              >
                <span className="uppercase tracking-[0.15em] text-[var(--ink-2)]">{c.metric}</span>
                <span className="text-[var(--ink-3)]">{WINDOW_LABEL[c.window]}</span>
                <span className="text-[var(--ink-3)]">
                  {c.priorDate} → {c.latestDate}
                </span>
                <span className="text-right text-[var(--ink-2)]">{c.rawDelta > 0 ? "+" : ""}{c.rawDelta.toFixed(2)}</span>
                <span className="text-right" style={{ color: scoreColor(c.zscore) }}>
                  z {c.zscore.toFixed(2)}
                </span>
                <span className="text-right text-[var(--ink-3)]">w {c.weight.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* feed */}
      <div className="mt-5">
        <AttentionInputForm narrativeId={def.id} onAdd={onAdd} />
      </div>

      {/* input log */}
      <div className="mt-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          Input log — {narrativeLog.length} datapoint{narrativeLog.length === 1 ? "" : "s"}
        </p>
        {narrativeLog.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--ink-3)]">Nothing fed yet.</p>
        ) : (
          <div className="mt-2 max-h-64 overflow-y-auto">
            {narrativeLog.map((d) => (
              <div key={d.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 font-mono text-[10px] tabular-nums">
                <span className="text-[var(--ink-3)]">{d.date}</span>
                <span className="text-[var(--ink-2)]">{d.metric}</span>
                <span className="text-[var(--ink)]">{d.value}</span>
                <span className="flex-1 truncate text-right text-[var(--ink-3)]">{d.source}</span>
                <button
                  onClick={() => onDelete(d.id)}
                  aria-label={`Remove ${d.metric} datapoint from ${d.date}`}
                  className="shrink-0 text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
