"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Earnings Beat Leaderboard · homepage module
   card (P·08). The surprise surface: watchlist companies ranked by
   size × consistency × recency of earnings beats. The card shows a
   live shelf readout (tracked count + current leader) with honest
   fallbacks, and a decorative surprise motif: quarterly result bars
   against a dashed estimate line — most clear it, one falls short.
──────────────────────────────────────────────────────────────── */
import { motion, useReducedMotion } from "framer-motion";
import {
  useBeatLeaderboard,
  formatScore,
  formatStreak,
  BEAT_ACCENT,
  BEAT_MISS,
  BEAT_ROUTE,
} from "./earnings/earningsData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 62%, #100c18 0%, var(--depth-1) 55%, #070808 100%)";

/* Decorative surprise motif — eight quarterly bars vs a dashed
   estimate line at y=46; heights hardcoded and deterministic
   (aria-hidden module-grammar texture, not data). One bar misses. */
const BARS = [
  { x: 10, top: 40 }, { x: 21, top: 36 }, { x: 32, top: 42 }, { x: 43, top: 30 },
  { x: 54, top: 52 }, { x: 65, top: 34 }, { x: 76, top: 26 }, { x: 87, top: 20 },
];
const ESTIMATE_Y = 46;

export default function EarningsBeat({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const board = useBeatLeaderboard(100);

  const leader = board.rows[0] ?? null;
  const monitorText =
    board.status === "live"
      ? "Monitor · weekly pull"
      : board.status === "pending"
        ? "Monitor · awaiting first pull"
        : board.status === "error"
          ? "Monitor · feed unreachable"
          : "Monitor · connecting";

  return (
    <a
      href={BEAT_ROUTE}
      aria-label="Earnings Beat Leaderboard — companies ranked by earnings beats, open module"
      className={`group/eb relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
    >
      <div className="relative flex-1 overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: ATMOSPHERE }} />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0px, transparent 47px, var(--line) 48px)",
          }}
        />

        {/* surprise motif — result bars vs the dashed estimate line */}
        <div aria-hidden className="absolute inset-x-12 bottom-12 top-[56%]">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* the estimate line */}
            <line
              x1="2" y1={ESTIMATE_Y} x2="98" y2={ESTIMATE_Y}
              stroke="var(--ink-3)" strokeOpacity="0.6" strokeWidth="1"
              strokeDasharray="1.4 2.2" vectorEffect="non-scaling-stroke"
            />
            {/* quarterly result bars */}
            {BARS.map(({ x, top }) => {
              const beat = top < ESTIMATE_Y;
              return (
                <line
                  key={x}
                  x1={x} y1="92" x2={x} y2={top}
                  stroke={beat ? BEAT_ACCENT : BEAT_MISS}
                  strokeOpacity={beat ? 0.6 : 0.75}
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {/* ground */}
            <line x1="0" y1="93" x2="100" y2="93" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* latest-quarter marker — the newest beat, glowing */}
          <span
            className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${BARS[BARS.length - 1].x}%`,
              top: `${BARS[BARS.length - 1].top}%`,
              background: BEAT_ACCENT,
              boxShadow: `0 0 12px ${BEAT_ACCENT}66`,
            }}
          />
        </div>

        {/* ghost numeral */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          08
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/eb:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity — left */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[58%] md:left-7 md:top-7 md:max-w-[48%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·08 — <span style={{ color: BEAT_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Earnings Beat Leaderboard
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Who keeps beating the street — watchlist companies ranked by the
            size, consistency, and recency of their EPS and revenue beats.
          </p>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Surprise · streak · confidence
          </p>
        </div>

        {/* shelf readout — right */}
        <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end text-right md:right-7 md:top-7">
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {!reduced ? (
              <motion.span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: BEAT_ACCENT }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: BEAT_ACCENT }} />
            )}
            {monitorText}
          </p>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Tickers ranked
          </p>
          <p className="mt-1 font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)] md:text-5xl">
            {board.status === "live" ? String(board.count).padStart(2, "0") : "——"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {board.status === "live" && leader
              ? "Current leader"
              : board.status === "pending"
                ? "Watchlist empty"
                : board.status === "error"
                  ? "Feed unreachable"
                  : "Connecting"}
          </p>

          {board.status === "live" && leader && (
            <div className="mt-4 w-40 md:mt-5 md:w-48">
              <p className="truncate text-right font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
                {leader.ticker}
                {leader.companyName ? ` — ${leader.companyName}` : ""}
              </p>
              <p className="mt-1 font-mono text-[11px] tabular-nums" style={{ color: BEAT_ACCENT }}>
                {formatScore(leader.rankScore)} · streak {formatStreak(leader)}
              </p>
            </div>
          )}
        </div>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/eb:text-[var(--ink)] md:bottom-6 md:right-7">
          Open module
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/eb:translate-x-1"
            style={{ color: BEAT_ACCENT }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Earnings Beat Leaderboard
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Surprise → streak → rank
        </p>
      </div>
    </a>
  );
}
