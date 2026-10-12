"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Earnings-Beat — fullscreen experience shell (P·04)
   The ranked earnings-beat leaderboard: watchlist companies scored
   by size × consistency × recency of EPS/revenue beats, streaks
   walked over full cached history (rendered "N+" when the streak
   runs off the cache edge), per-quarter beat maps, and honest null
   semantics throughout — a data gap is "—", never a zero. Esc or
   "Index" returns to the homepage.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  useBeatLeaderboard,
  coverageMeta,
  formatDate,
  formatPct,
  formatQuarterLabel,
  formatScore,
  formatStreak,
  glyphColor,
  quarterGlyph,
  BEAT_ACCENT,
  BEAT_MISS,
  BEAT_MUTED,
  type BeatRow,
} from "../../components/projects/earnings/earningsData";
import ModuleSwitcher from "../../components/projects/ModuleSwitcher";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #100c18 0%, var(--depth-1) 55%, #070808 100%)";

/* table grid — one source of truth for header + rows */
const GRID =
  "grid grid-cols-[2.75rem_minmax(11rem,1.6fr)_4.5rem_4.25rem_7.5rem_4.25rem_5.5rem_5.5rem_8.5rem] items-baseline gap-x-3";

const scoreColor = (v: number | null) =>
  v === null ? "var(--ink-3)" : v > 0 ? BEAT_ACCENT : v < 0 ? BEAT_MISS : "var(--ink-2)";

/** Beat map: oldest → newest, capped to the last 8 quarters so the
 *  rightmost glyph is always the latest report. */
function BeatMap({ row }: { row: BeatRow }) {
  const glyphs = row.quarters
    .slice(0, 8)
    .map((q) => quarterGlyph(q.epsSurprisePercent))
    .reverse();
  return (
    <p aria-label={`Beat history, oldest to newest: ${glyphs.join(" ")}`} className="font-mono text-[11px] tracking-[0.2em]">
      {glyphs.map((g, i) => (
        <span key={i} style={{ color: glyphColor(g) }}>
          {g}
        </span>
      ))}
    </p>
  );
}

export default function EarningsBeatView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const board = useBeatLeaderboard(100);
  const [leaving, setLeaving] = useState(false);

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
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  const live = board.status === "live" || board.status === "stale";

  const stats = useMemo(() => {
    const onStreak = board.rows.filter((r) => r.beatStreak > 0);
    const longest = onStreak.reduce<BeatRow | null>(
      (best, r) => (best === null || r.beatStreak > best.beatStreak ? r : best),
      null,
    );
    return {
      tracked: board.rows.length,
      onStreak: onStreak.length,
      longest,
      epsOnly: board.rows.filter((r) => r.dataQuality.epsQuarters > 0 && r.dataQuality.revenueQuarters === 0).length,
      excludedRevenue: board.rows.filter((r) => r.dataQuality.revenueExcludedQuarters > 0).map((r) => r.ticker),
    };
  }, [board.rows]);

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
            aria-label="Close Earnings Beat Leaderboard and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Earnings Beat Leaderboard
          </p>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <ModuleSwitcher current="earnings" />
        </div>
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
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: BEAT_ACCENT }}
            />
          )}
          Weekly pull · Surprise engine
        </p>
      </header>

      {/* ── scroll region ── */}
      <div
        data-lenis-prevent
        className="absolute inset-x-0 bottom-12 top-14 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-10">
          {/* title row */}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
                P·04 — Intelligence module
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                Earnings Beat Leaderboard
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                Watchlist companies ranked by the size, consistency, and
                recency of their earnings beats — recency-weighted EPS and
                revenue surprises composited into one score, beat streaks
                walked over the full cached history.
              </p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              {live
                ? `Last refresh ${formatDate(board.dataAsOf, true)} · ${board.count} tickers`
                : board.status === "pending"
                  ? "Awaiting first pull"
                  : board.status === "error"
                    ? "Feed unreachable"
                    : "Connecting…"}
            </p>
          </div>

          <section aria-labelledby="earnings-seasons-title" className="mt-7 rounded-sm hairline bg-[var(--depth-1)] px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="earnings-seasons-title" className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: BEAT_ACCENT }}>
                U.S. earnings seasons
              </h2>
              <p className="text-[11px] text-[var(--ink-3)]">Typical reporting windows · company fiscal calendars vary</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {[
                { quarter: "Q4 results", window: "Jan–Feb" },
                { quarter: "Q1 results", window: "Apr–May" },
                { quarter: "Q2 results", window: "Jul–Aug" },
                { quarter: "Q3 results", window: "Oct–Nov" },
              ].map(({ quarter, window }) => (
                <div key={quarter}>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{quarter}</dt>
                  <dd className="mt-1 text-[13px] text-[var(--ink)]">{window}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
              Reporting usually begins in early to mid-January, April, July, and October and lasts around six weeks.
              {" "}<a href="https://www.schwab.com/learn/story/earnings-season-what-to-look" target="_blank" rel="noreferrer" className="underline decoration-[var(--line-2)] underline-offset-4 hover:text-[var(--ink)]">Season guide ↗</a>
            </p>
          </section>

          {board.status === "stale" && (
            <p role="status" className="mt-4 border-l-2 pl-3 text-[12px] leading-relaxed" style={{ borderColor: BEAT_MUTED, color: BEAT_MUTED }}>
              {board.dataAsOf
                ? `Refresh overdue — showing cached rankings from ${formatDate(board.dataAsOf, true)}. The weekly update has not refreshed this feed.`
                : "Showing cached rankings. The last refresh date is unavailable."}
            </p>
          )}

          {live && (
            <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[var(--ink-2)]">
              {stats.epsOnly} of {board.count} scores use EPS only. Revenue contributes where a usable comparison is available.
              {stats.excludedRevenue.length > 0 && ` ${stats.excludedRevenue.join(", ")}: revenue excluded because the actual and estimate bases are unverified.`}
              {" "}A recent refresh does not mean every report has complete data.
            </p>
          )}

          {/* summary strip */}
          {live && (
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-sm hairline bg-[var(--line)] md:grid-cols-4">
              {[
                { label: "Tracked tickers", value: String(stats.tracked).padStart(2, "0"), color: "var(--ink)" },
                { label: "On a beat streak", value: String(stats.onStreak).padStart(2, "0"), color: BEAT_ACCENT },
                {
                  label: stats.longest ? `Longest streak · ${stats.longest.ticker}` : "Longest streak",
                  value: stats.longest ? formatStreak(stats.longest) : "—",
                  color: BEAT_ACCENT,
                },
                { label: "EPS-only scores", value: String(stats.epsOnly).padStart(2, "0"), color: BEAT_MUTED },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--depth-1)] px-5 py-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    {label}
                  </p>
                  <p
                    className="mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight"
                    style={{ color }}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── the ranked table ── */}
          <div className="mt-10 overflow-x-auto">
            <div className="min-w-[56rem]">
              {/* header */}
              <div className={`${GRID} border-b border-[var(--line)] pb-3`}>
                {[
                  "Rank", "Company", "Score", "Streak", "Beat map",
                  "Data", "EPS avg", "Rev avg", "Latest report",
                ].map((h, i) => (
                  <p
                    key={h}
                    className={`font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] ${
                      i >= 6 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </p>
                ))}
              </div>

              {/* loading skeleton */}
              {board.status === "loading" && (
                <div aria-hidden className="animate-pulse">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className={`${GRID} border-b border-[var(--line)] py-3.5`}>
                      {Array.from({ length: 9 }, (_, j) => (
                        <span key={j} className="h-[9px] rounded-full bg-[var(--depth-3)]" />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* honest empty states */}
              {(board.status === "pending" || board.status === "error") && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
                    {board.status === "pending" ? "Leaderboard empty" : "Feed unreachable"}
                  </p>
                  <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-3)]">
                    {board.status === "pending"
                      ? "Rankings will appear once reported earnings with usable surprise data are available. Results update weekly after companies report."
                      : board.errorMessage ?? "The leaderboard feed did not respond — reload to retry."}
                  </p>
                </div>
              )}

              {/* rows — API order is the leaderboard order */}
              {live &&
                board.rows.map((r, idx) => {
                  const coverage = coverageMeta(r);
                  return (
                    <div
                      key={r.ticker}
                      className={`${GRID} border-b border-[var(--line)] py-3 transition-colors duration-[var(--dur-micro)] hover:bg-[rgba(232,235,232,0.02)]`}
                      style={
                        idx === 0 && r.rankScore !== null
                          ? { background: "rgba(180, 142, 232, 0.05)" }
                          : undefined
                      }
                    >
                      <p className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                        {String(idx + 1).padStart(2, "0")}
                      </p>

                      <p className="flex min-w-0 items-baseline gap-2.5">
                        <span className="shrink-0 font-mono text-sm text-[var(--ink)]">
                          {r.ticker}
                        </span>
                        <span className="truncate text-[11px] text-[var(--ink-3)]">
                          {r.companyName ?? ""}
                        </span>
                        {idx === 0 && r.rankScore !== null && (
                          <span
                            className="shrink-0 rounded-[2px] px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.2em]"
                            style={{
                              color: BEAT_ACCENT,
                              background: "rgba(180, 142, 232, 0.12)",
                            }}
                          >
                            Leader
                          </span>
                        )}
                      </p>

                      <p
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: scoreColor(r.rankScore) }}
                      >
                        {formatScore(r.rankScore)}
                      </p>

                      <p
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: r.beatStreak > 0 ? BEAT_ACCENT : "var(--ink-3)" }}
                      >
                        {formatStreak(r)}
                      </p>

                      <BeatMap row={r} />

                      <p
                        className="font-mono text-[10px] uppercase tracking-[0.15em]"
                        style={{ color: coverage.color }}
                        title={coverage.description}
                        aria-label={coverage.description}
                      >
                        {coverage.label}
                      </p>

                      <p
                        className="text-right font-mono text-[11px] tabular-nums"
                        style={{ color: scoreColor(r.epsSurpriseAvg) }}
                      >
                        {formatPct(r.epsSurpriseAvg)}
                      </p>
                      <p
                        className="text-right font-mono text-[11px] tabular-nums"
                        style={{ color: scoreColor(r.revenueSurpriseAvg) }}
                      >
                        {formatPct(r.revenueSurpriseAvg)}
                      </p>

                      <p className="text-right font-mono text-[10px] tabular-nums text-[var(--ink-2)]" title={r.latest && !r.latest.reportDate ? "Announcement date unavailable from the feed; fiscal quarter shown." : undefined}>
                        {r.latest
                          ? `${formatQuarterLabel(r.latest.fiscalYear, r.latest.fiscalQuarter)}${
                              r.latest.reportDate ? ` · ${formatDate(r.latest.reportDate)}` : " · date —"
                            }`
                          : "—"}
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* methodology footnote */}
          <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
            Score = recency-weighted composite of EPS and revenue surprise
            percentages over the trailing four quarters, using EPS only when
            revenue is missing or its comparison basis is unverified, winsorized so one
            blowout quarter can&apos;t dominate. Streak counts consecutive EPS
            beats from the newest quarter over <em>all</em> cached history; an
            unknown surprise breaks the streak — a data gap never extends it —
            and &ldquo;N+&rdquo; means the streak runs off the edge of the
            cache. Beat map: ▲ beat · ▼ miss · ◦ met · &middot; unknown, oldest
            to newest. &ldquo;—&rdquo; is a real null, never zero. Backfilled
            history older than ~30 days is EPS-only (the free-tier calendar
            can&apos;t see further back); revenue accrues forward from the
            weekly Saturday pull. Every number traces to a real Finnhub field
            or a deterministic formula — nothing synthetic. EPS uses the
            provider&apos;s actual/consensus pair, which may be adjusted rather
            than GAAP. Data labels describe coverage, not independent verification.
          </p>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·04 — Earnings Beat Leaderboard
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Surprise readouts on free data feeds · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
