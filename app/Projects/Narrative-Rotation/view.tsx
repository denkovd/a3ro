"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Narrative-Rotation — fullscreen experience shell.
   Board of narrative cards sorted by attention-score delta, split
   into gaining / losing / insufficient-data lanes; click a card for
   the full input log + score contributions + market-corroboration
   detail. Assisted intelligence, not autonomous: scores only move
   when the user feeds them (Google Trends CSV, manual entries, or a
   curated JSON feed upload) — see PLAN-frontend-intelligence-modules.md
   Task 3 for the fit rationale (deterministic scoring, structured
   inputs only, no RSS/screenshot/crawling ingestion in v1).
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useBullSnapshot } from "../../components/projects/bull/bullData";
import {
  useNarrativeBoard,
  NARR_ACCENT,
  NARR_MUTED_PINK,
  type NarrativeBoardRow,
} from "../../components/projects/narrative/narrativeData";
import { normalizeDatapoints } from "../../components/projects/narrative/narrativeStore";
import NarrativeCard from "../../components/projects/narrative/NarrativeCard";
import NarrativeDetail from "../../components/projects/narrative/NarrativeDetail";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #180f0c 0%, var(--depth-1) 55%, #070808 100%)";

type Lane = "gaining" | "losing" | "insufficient";

function laneOf(row: NarrativeBoardRow): Lane {
  if (row.scoreRow.status === "insufficient_data" || row.scoreRow.score === null) return "insufficient";
  return row.scoreRow.score >= 0 ? "gaining" : "losing";
}

export default function NarrativeRotationView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bull = useBullSnapshot();
  const board = useNarrativeBoard(bull.rows, bull.status === "live");

  const leave = useCallback(() => {
    if (leaving) return;
    if (reduced) {
      router.push("/#modules");
      return;
    }
    setLeaving(true);
  }, [leaving, reduced, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedId) setSelectedId(null);
        else leave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, selectedId]);

  const lanes = useMemo(() => {
    const out: Record<Lane, NarrativeBoardRow[]> = { gaining: [], losing: [], insufficient: [] };
    for (const row of board.rows) out[laneOf(row)].push(row);
    out.gaining.sort((a, b) => (b.scoreRow.score ?? 0) - (a.scoreRow.score ?? 0));
    out.losing.sort((a, b) => (a.scoreRow.score ?? 0) - (b.scoreRow.score ?? 0));
    out.insufficient.sort((a, b) => a.def.label.localeCompare(b.def.label));
    return out;
  }, [board.rows]);

  const selected = board.rows.find((r) => r.def.id === selectedId) ?? null;

  const onJsonFeed = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const all = normalizeDatapoints(parsed);
      const knownIds = new Set(board.rows.map((r) => r.def.id));
      const known = all.filter((d) => knownIds.has(d.narrativeId));
      board.addDatapoints(known);
      const unknown = all.length - known.length;
      setFeedNotice(
        `${file.name}: added ${known.length} datapoint${known.length === 1 ? "" : "s"}` +
          (unknown > 0 ? ` · ${unknown} referenced an unknown narrative id and were skipped` : ""),
      );
    } catch {
      setFeedNotice(`${file.name}: not valid JSON`);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const live = board.status === "live";

  return (
    <motion.main
      className="grain fixed inset-0 overflow-hidden bg-[var(--depth-0)]"
      initial={false}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.28, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (leaving) router.push("/#modules");
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />

      {/* ── top chrome ── */}
      <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <div className="flex items-baseline gap-4">
          <button
            onClick={leave}
            className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            aria-label="Close Narrative Rotation and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Narrative Rotation
          </p>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <ModuleSwitcher current="narrative" />
        </div>
        <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: NARR_ACCENT }} />
          Assisted intelligence · scores update when fed
        </p>
      </header>

      {/* ── scroll region ── */}
      <div data-lenis-prevent className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                Intelligence module
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                Narrative Rotation
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                Which narrative is climbing — attention deltas across 1d/1w/1m windows, cross-sectionally
                z-scored against every other tracked narrative, shown next to whether the tape agrees.
                Deterministic scoring, structured inputs only. Not investment advice.
              </p>
            </div>
            <label
              className="cursor-pointer rounded-[2px] border border-[var(--line)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)]"
              htmlFor="narrative-json-feed"
            >
              Upload JSON feed
              <input ref={fileRef} id="narrative-json-feed" type="file" accept=".json,application/json" className="hidden" onChange={onJsonFeed} />
            </label>
          </div>
          {feedNotice && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{feedNotice}</p>
          )}

          {/* honest states */}
          {board.status === "loading" && (
            <p className="mt-16 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
              Loading narrative definitions…
            </p>
          )}
          {board.status === "error" && (
            <div className="mt-16 flex flex-col items-center gap-3 py-10 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-2)]">Feed unreachable</p>
              <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-3)]">
                {board.errorMessage ?? "Could not load /narratives/narratives.json."}
              </p>
            </div>
          )}

          {live && selected && (
            <div className="mt-8">
              <NarrativeDetail
                row={selected}
                log={board.datapoints}
                onAdd={board.addDatapoints}
                onDelete={board.deleteDatapoint}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}

          {live && !selected && (
            <div className="mt-8 flex flex-col gap-10">
              <Lane title="Gaining" rows={lanes.gaining} accent={NARR_ACCENT} onSelect={setSelectedId} />
              <Lane title="Losing" rows={lanes.losing} accent={NARR_MUTED_PINK} onSelect={setSelectedId} />
              <Lane title="Insufficient data" rows={lanes.insufficient} accent="var(--ink-3)" onSelect={setSelectedId} />
            </div>
          )}
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] backdrop-blur-md md:px-10">
        <span>Narrative Rotation</span>
        <span>Weighted z-scored attention deltas · not investment advice</span>
      </footer>
    </motion.main>
  );
}

function Lane({
  title,
  rows,
  accent,
  onSelect,
}: {
  title: string;
  rows: NarrativeBoardRow[];
  accent: string;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2.5 border-b border-[var(--line)] pb-2.5">
        <span aria-hidden className="h-[5px] w-[5px] rounded-full" style={{ background: accent }} />
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
          {title} — {rows.length}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <NarrativeCard key={row.def.id} row={row} active={false} onSelect={() => onSelect(row.def.id)} />
        ))}
      </div>
    </div>
  );
}
