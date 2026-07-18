"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO Intelligence — Bull Market Finder · homepage module card (P·05)
   The whole-market screener surface: ~650 assets in five tiers,
   ranked by newly bullish state (Money Line, daily × weekly
   confirmed). The card leads with what just double-confirmed and
   opens the ranked table at /Projects/Bull-Market-Finder.
   Same truth-pass posture as every module: before the first scan
   the card says so — no invented numbers.
──────────────────────────────────────────────────────────────── */
import { motion, useReducedMotion } from "framer-motion";
import {
  useBullSnapshot,
  bullDistribution,
  formatDaysSince,
  formatX,
  formatDate,
  BULL_ACCENT,
  BULL_MUTED_AMBER,
  BULL_MUTED_PINK,
  BULL_ROUTE,
  type BullRow,
} from "./bull/bullData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 62%, #0c1018 0%, var(--depth-1) 55%, #070808 100%)";

/* Decorative screener motif — a field of quiet candidates with a few
   confirmed risers. Hardcoded, deterministic, aria-hidden. */
const FIELD_DOTS: ReadonlyArray<readonly [number, number]> = [
  [6, 78], [14, 64], [22, 82], [30, 58], [38, 72], [46, 66],
  [54, 80], [62, 54], [70, 74], [78, 62], [86, 70], [94, 76],
];
const RISERS: ReadonlyArray<readonly [number, number]> = [
  [30, 34], [62, 26], [86, 40],
];

/** Hero rows: newly bullish first; falls back to the strongest
 *  double-confirmed names when nothing fresh turned this window. */
function highlights(rows: BullRow[], max = 4): { rows: BullRow[]; fresh: boolean } {
  const fresh = rows.filter((r) => r.newlyBullish).slice(0, max);
  if (fresh.length > 0) return { rows: fresh, fresh: true };
  return { rows: rows.filter((r) => r.verdict === "BULLISH").slice(0, max), fresh: false };
}

export default function BullFinder({ className = "" }: { className?: string }) {
  const snap = useBullSnapshot();
  const reduced = useReducedMotion();

  const live = snap.status === "live";
  const hero = highlights(snap.rows);
  const dist = bullDistribution(snap.rows);
  const newlyCount = snap.rows.filter((r) => r.newlyBullish).length;

  const monitorText =
    snap.status === "live"
      ? "Monitor · daily scan"
      : snap.status === "pending"
        ? "Monitor · awaiting first scan"
        : snap.status === "error"
          ? "Monitor · feed unreachable"
          : "Monitor · connecting";

  return (
    <a
      href={BULL_ROUTE}
      aria-label="Bull Market Finder — whole-market bullish-state screener, open module"
      className={`group/bf relative flex cursor-pointer flex-col overflow-hidden rounded-sm hairline bg-[var(--depth-1)] transition-colors duration-[var(--dur-base)] hover:border-[var(--line-2)] ${className}`}
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

        {/* screener field motif — many candidates, few confirmations */}
        <div aria-hidden className="absolute inset-x-12 bottom-12 top-[56%]">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {FIELD_DOTS.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="var(--ink-3)" fillOpacity="0.45" />
            ))}
            {RISERS.map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <line
                  x1={x} y1={y + 26} x2={x} y2={y + 6}
                  stroke={BULL_ACCENT} strokeOpacity="0.4" strokeWidth="1"
                  strokeDasharray="1 2" vectorEffect="non-scaling-stroke"
                />
                <circle cx={x} cy={y} r="1.6" fill={BULL_ACCENT} />
              </g>
            ))}
            <line
              x1="0" x2="100" y1="46" y2="46"
              stroke={BULL_ACCENT} strokeOpacity="0.16" strokeWidth="1"
              strokeDasharray="0.8 1.6" vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: "62%", top: "26%",
              background: BULL_ACCENT,
              boxShadow: `0 0 12px ${BULL_ACCENT}55`,
            }}
          />
        </div>

        {/* ghost numeral */}
        <span className="pointer-events-none absolute bottom-3 left-4 select-none font-mono text-[clamp(4rem,10vw,8rem)] font-medium leading-none text-[var(--depth-3)]">
          05
        </span>

        {/* corner registration marks */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-[var(--ink-3)] opacity-40 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/bf:border-[#7f9ee8] group-hover/bf:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-4 h-3 w-3 border-b border-l border-[var(--ink-3)] opacity-30"
        />

        {/* identity + highlights — left */}
        <div className="pointer-events-none absolute left-5 top-5 max-w-[58%] md:left-7 md:top-7 md:max-w-[48%]">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
            P·05 — <span style={{ color: BULL_ACCENT }}>Module</span>
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
            A3RO Intelligence
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Bull Market Finder
          </h3>
          <p className="mt-3 hidden text-[13px] leading-relaxed text-[var(--ink-2)] md:block">
            Whole-market bullish-state screener — double confirmation on
            daily and weekly closes, ranked by recency and strength.
          </p>

          <div className="mt-5 md:mt-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              {live
                ? hero.fresh
                  ? "Newly double confirmed"
                  : "No fresh confirmations — strongest bulls"
                : snap.status === "pending"
                  ? "Scan pending"
                  : snap.status === "error"
                    ? "Feed unreachable"
                    : "Connecting"}
            </p>

            {live ? (
              <ul className="mt-3 flex flex-col gap-[9px] md:gap-2.5">
                {hero.rows.map((r) => (
                  <li key={r.symbol} className="flex items-baseline gap-3">
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] shrink-0 self-center rounded-full"
                      style={{
                        background: r.newlyBullish ? BULL_ACCENT : "var(--ink-3)",
                        boxShadow: r.newlyBullish ? `0 0 8px ${BULL_ACCENT}66` : "none",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
                      {r.displayName}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                      {formatDaysSince(r.daysSinceAligned)}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[10px] tabular-nums"
                      style={{ color: BULL_ACCENT }}
                    >
                      {formatX(r.strengthVol)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 max-w-[240px] font-mono text-[9px] uppercase leading-relaxed tracking-[0.15em] text-[var(--ink-3)]">
                {snap.status === "pending"
                  ? "First pass runs 06:20 UTC — the screener fills after the daily scan."
                  : snap.status === "error"
                    ? "Screener feed did not respond — retry on reload."
                    : "Requesting latest scan…"}
              </p>
            )}
          </div>
        </div>

        {/* scan readout — right */}
        <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end text-right md:right-7 md:top-7">
          <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            {!reduced ? (
              <motion.span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: BULL_ACCENT }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-block h-[5px] w-[5px] rounded-full"
                style={{ background: BULL_ACCENT }}
              />
            )}
            {monitorText}
          </p>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            Newly bullish
          </p>
          <p className="mt-1 font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)] md:text-5xl">
            {live ? String(newlyCount).padStart(2, "0") : "——"}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {live ? `Scan ${formatDate(snap.runDate)} · ${snap.count} assets` : "No scan on record"}
          </p>

          {live && (
            <div className="mt-4 w-36 md:mt-5 md:w-44">
              {[
                { label: "Double", value: dist.double, color: BULL_ACCENT },
                { label: "Conflicted", value: dist.early + dist.lagging, color: BULL_MUTED_AMBER },
                { label: "Bearish", value: dist.bearish, color: BULL_MUTED_PINK },
              ].map(({ label, value, color }, i) => (
                <div
                  key={label}
                  className={`flex items-baseline justify-between py-[5px] ${i > 0 ? "hairline-t" : ""}`}
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                    {label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color }}>
                    {String(value).padStart(3, "0")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* the one affordance */}
        <p className="pointer-events-none absolute bottom-5 right-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-base)] group-hover/bf:text-[var(--ink)] md:bottom-6 md:right-7">
          Open module
          <span
            aria-hidden
            className="inline-block transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/bf:translate-x-1"
            style={{ color: BULL_ACCENT }}
          >
            →
          </span>
        </p>
      </div>

      {/* card footer — directory grammar */}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 hairline-t">
        <h3 className="text-sm font-medium text-[var(--ink)]">
          A3RO Intelligence — Bull Market Finder
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Money Line D×W · Weekly · Daily
        </p>
      </div>
    </a>
  );
}
