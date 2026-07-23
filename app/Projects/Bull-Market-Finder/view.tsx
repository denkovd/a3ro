"use client";
/* ────────────────────────────────────────────────────────────────
   /Projects/Bull-Market-Finder — fullscreen experience shell (P·05)
   The whole-market ranked table: ~670 assets across five tiers,
   Money Line state double-confirmed on daily × weekly, grouped
   newly-bullish → double confirmed → conflicted → bearish. Tier
   tabs filter client-side; a transitions rail shows what changed
   verdict recently. Esc or "Index" returns to the homepage.
──────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  useBullSnapshot,
  useBullTransitions,
  withBullGroupBoundaries,
  bullDistribution,
  bullGroupLabelFor,
  bullStateLabel,
  bullConsensusColor,
  formatConsensus,
  BULL_VERDICT_META,
  TIER_LABEL,
  TIER_ORDER,
  DEFAULT_STRATEGY_ID,
  formatDate,
  formatDaysSince,
  formatPct,
  formatPrice,
  formatX,
  BULL_ACCENT,
  BULL_MUTED_AMBER,
  BULL_MUTED_PINK,
  type BullRow,
  type BullGroupKey,
  type BullTier,
  type BullVerdict,
  type StrategyTimeframe,
} from "../../components/projects/bull/bullData";

const ATMOSPHERE =
  "radial-gradient(90% 110% at 50% 65%, #0c1018 0%, var(--depth-1) 55%, #070808 100%)";

/* table grid — one source of truth for header + rows */
const GRID =
  "grid grid-cols-[2.75rem_minmax(11rem,1.6fr)_6.5rem_2rem_2rem_8.5rem_5.25rem_5.25rem_4rem_7.25rem] items-baseline gap-x-3";

/* daily/weekly glyphs derive from the verdict — it encodes both legs */
const legGlyphs = (v: BullVerdict): [string, string] =>
  v === "BULLISH" ? ["▲", "▲"]
    : v === "CONFLICT_DAILY" ? ["▲", "▼"]
      : v === "CONFLICT_WEEKLY" ? ["▼", "▲"]
        : v === "BEARISH" ? ["▼", "▼"]
          : ["·", "·"];

/* Raw per-leg trend (API dailyTrend/weeklyTrend) — the honest source
   for single-leg lenses, where the verdict encodes only the driving
   leg. Null (pre-merge payload) falls back to the verdict derivation. */
const trendGlyph = (t: number | null): string | null =>
  t === 1 ? "▲" : t === -1 ? "▼" : t === 0 ? "·" : null;

const glyphColor = (g: string) =>
  g === "▲" ? BULL_ACCENT : g === "▼" ? BULL_MUTED_PINK : "var(--ink-3)";

const rsColor = (v: number | null) =>
  v === null ? "var(--ink-3)" : v > 0 ? BULL_ACCENT : v < 0 ? BULL_MUTED_PINK : "var(--ink-2)";

const GROUP_DOT: Record<BullGroupKey, string> = {
  newlyBullish: BULL_ACCENT,
  double: BULL_ACCENT,
  early: BULL_MUTED_AMBER,
  lagging: BULL_MUTED_AMBER,
  bearish: BULL_MUTED_PINK,
  warmup: "var(--ink-3)",
};

function confirmedCell(r: BullRow): string {
  if (r.verdict === "BULLISH" || r.verdict === "BEARISH") {
    return `${formatDate(r.alignedSince)} · ${formatDaysSince(r.daysSinceAligned)}`;
  }
  if (r.verdict === "CONFLICT_DAILY") return `${formatDate(r.dailyFlipDate)} · D`;
  if (r.verdict === "CONFLICT_WEEKLY") return `${formatDate(r.weeklyFlipDate)} · W`;
  return "—";
}

type TabKey = "all" | BullTier;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  ...TIER_ORDER.map((t) => ({ key: t as TabKey, label: TIER_LABEL[t] })),
];

/* per-strategy methodology footnote — spec §5: ml-dw keeps today's
   text verbatim; weekly/daily get honest, lens-specific equivalents.
   All three mention the Lens/consensus column. */
const FOOTNOTE_BY_STRATEGY: Record<string, string> = {
  "ml-dw":
    "States — Double Confirmed: bullish on daily and weekly · " +
    "Conflicted Early Bullish: daily flipped, weekly hasn't · " +
    "Conflicted Lagging Bullish: weekly bull, daily has broken · " +
    "Bearish: bearish on both. Flips confirm only on candle close " +
    "(Donchian 20, ratcheted); the current week never counts until " +
    "it closes. Newly bullish = double confirmation within the last 10 " +
    "sessions. Ranked by recency; volatility-normalized strength " +
    "(cushion + move since flip, ÷ ATR) breaks ties. RS 63d is the " +
    "63-session return minus the tier benchmark (S&P 500 for " +
    "equities/ETFs, BTC for crypto) — context, not a ranking input. " +
    "WTI and gold futures are roll-adjusted continuous series; every " +
    "roll is logged and probe-verified. Lens is the consensus column — " +
    "how the other strategies read the same symbol on this run.",
  "ml-weekly":
    "Weekly lens — Money Line evaluated on weekly closes only; a state " +
    "changes only when a weekly candle closes, and the forming week " +
    "never counts. States collapse to Bull/Bear/Warm-up (one leg can't " +
    "conflict with itself); recency is shown in trading days (weekly " +
    "bars × 5) so it stays comparable with the other lenses. Lens is " +
    "the consensus column — how the daily and D×W lenses read the same " +
    "symbol on this run.",
  "ml-daily":
    "Daily lens — Money Line evaluated on daily closes only: the fast, " +
    "noisier read, expect more turnover here than on the weekly or D×W " +
    "lenses. States collapse to Bull/Bear/Warm-up; flips confirm only " +
    "on the close of the crossing daily bar. Lens is the consensus " +
    "column — how the weekly and D×W lenses read the same symbol on " +
    "this run; watch it here first when a fast flip is still unconfirmed " +
    "elsewhere.",
};

export default function BullMarketFinderView() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [strategy, setStrategy] = useState<string>(DEFAULT_STRATEGY_ID);
  const snap = useBullSnapshot(strategy);
  const transitions = useBullTransitions(14, strategy);
  const [leaving, setLeaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [disagreementOnly, setDisagreementOnly] = useState(false);

  const strategies = snap.strategies;
  const activeStrategyMeta =
    strategies.find((s) => s.id === strategy) ?? strategies[0];
  const timeframe: StrategyTimeframe = activeStrategyMeta?.timeframe ?? "multi";

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

  const live = snap.status === "live";
  const tierRows = useMemo(
    () => (tab === "all" ? snap.rows : snap.rows.filter((r) => r.tier === tab)),
    [snap.rows, tab],
  );
  const visibleRows = useMemo(
    () =>
      disagreementOnly
        ? tierRows.filter((r) => r.consensus.bull > 0 && r.consensus.bear > 0)
        : tierRows,
    [tierRows, disagreementOnly],
  );
  const dist = bullDistribution(visibleRows);
  const newlyCount = visibleRows.filter((r) => r.newlyBullish).length;
  const grouped = withBullGroupBoundaries(visibleRows);
  const newlyBullishTransitions = transitions.rows.filter((t) => t.toVerdict === "BULLISH");

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
            aria-label="Close Bull Market Finder and return to the index"
          >
            ← Index
          </button>
          <span aria-hidden className="text-[var(--ink-3)]">/</span>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
            A3RO Intelligence — Bull Market Finder
          </p>
        </div>
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
          Daily scan · Money Line engine
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
                P·05 — Intelligence module
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
                Bull Market Finder
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--ink-2)]">
                Whole-market bullish-state screener — Money Line trend flips
                ranked by the active strategy lens across macro assets, the
                S&amp;P 500, crypto majors and liquid ETFs, ranked by how
                recently confirmation arrived.
              </p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              {live
                ? `Scan ${formatDate(snap.runDate)} · ${snap.count} assets`
                : snap.status === "pending"
                  ? "Awaiting first scan"
                  : snap.status === "error"
                    ? "Feed unreachable"
                    : "Connecting…"}
            </p>
          </div>

          {/* transitions rail — what just turned */}
          {live && newlyBullishTransitions.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-sm hairline bg-[var(--depth-1)] px-5 py-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                Turned bullish — last 14 days
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {newlyBullishTransitions.slice(0, 12).map((t) => (
                  <p key={`${t.runDate}-${t.symbol}`} className="flex items-baseline gap-2.5">
                    <span
                      aria-hidden
                      className="h-[5px] w-[5px] self-center rounded-full"
                      style={{ background: BULL_ACCENT, boxShadow: `0 0 8px ${BULL_ACCENT}66` }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
                      {t.displayName}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                      {formatDate(t.runDate)}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* summary strip */}
          {live && (
            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-sm hairline bg-[var(--line)] md:grid-cols-5">
              {[
                { label: "Newly bullish", value: newlyCount, color: BULL_ACCENT },
                { label: "Double confirmed", value: dist.double, color: BULL_ACCENT },
                { label: "Early (D only)", value: dist.early, color: BULL_MUTED_AMBER },
                { label: "Lagging (W only)", value: dist.lagging, color: BULL_MUTED_AMBER },
                { label: "Bearish", value: dist.bearish, color: BULL_MUTED_PINK },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--depth-1)] px-5 py-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                    {label}
                  </p>
                  <p
                    className="mt-2 font-mono text-2xl font-medium tabular-nums tracking-tight"
                    style={{ color }}
                  >
                    {String(value).padStart(2, "0")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* strategy switcher — segmented control, same grammar as the
              tier tabs below; data-driven from the API's `strategies`
              list (DEFAULT_STRATEGIES fills in before first response). */}
          <div className="mt-10 flex flex-wrap items-baseline gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
              Strategy
            </span>
            {strategies.map((s) => {
              const active = strategy === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  aria-pressed={active}
                  className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
                  style={{
                    color: active ? BULL_ACCENT : "var(--ink-3)",
                    background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                    border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* tier tabs + disagreement toggle */}
          <div className="mt-3 flex flex-wrap items-baseline gap-1.5">
            {TABS.map(({ key, label }) => {
              const active = tab === key;
              const count =
                key === "all" ? snap.rows.length : snap.rows.filter((r) => r.tier === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-pressed={active}
                  className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
                  style={{
                    color: active ? BULL_ACCENT : "var(--ink-3)",
                    background: active ? "rgba(127, 158, 232, 0.10)" : "transparent",
                    border: `1px solid ${active ? "rgba(127, 158, 232, 0.35)" : "var(--line)"}`,
                  }}
                >
                  {label}
                  {live && (
                    <span className="ml-2 tabular-nums opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setDisagreementOnly((v) => !v)}
              aria-pressed={disagreementOnly}
              className="rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
              style={{
                color: disagreementOnly ? BULL_MUTED_AMBER : "var(--ink-3)",
                background: disagreementOnly ? "rgba(184, 163, 117, 0.12)" : "transparent",
                border: `1px solid ${disagreementOnly ? "rgba(184, 163, 117, 0.4)" : "var(--line)"}`,
              }}
            >
              Disagreement
            </button>
          </div>

          {/* ── the ranked table ── */}
          <div className="mt-6 overflow-x-auto">
            <div className="min-w-[56rem]">
              {/* header */}
              <div className={`${GRID} border-b border-[var(--line)] pb-3`}>
                {[
                  "Rank", "Asset", "State", "D", "W",
                  "Confirmed / Flip", "Str ×vol", "RS 63d", "Lens", "Last close",
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
              {snap.status === "loading" && (
                <div aria-hidden className="animate-pulse">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className={`${GRID} border-b border-[var(--line)] py-3.5`}>
                      {Array.from({ length: 10 }, (_, j) => (
                        <span key={j} className="h-[9px] rounded-full bg-[var(--depth-3)]" />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* honest empty states */}
              {(snap.status === "pending" || snap.status === "error") && (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-2)]">
                    {snap.status === "pending" ? "Scan pending" : "Feed unreachable"}
                  </p>
                  <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-3)]">
                    {snap.status === "pending"
                      ? "The first whole-market scan runs at 06:20 UTC via the daily workflow. Rankings appear here once the universe has been scored."
                      : snap.errorMessage ?? "The screener feed did not respond — reload to retry."}
                  </p>
                </div>
              )}

              {/* rows, grouped by state */}
              {live &&
                grouped.map(({ row: r, group, startsGroup }, idx) => {
                  // Single-leg lenses keep both glyph columns — both legs
                  // are always computed — but dim the leg that doesn't
                  // drive this strategy's ranking.
                  const [vdG, vwG] = legGlyphs(r.verdict);
                  const dG = trendGlyph(r.dailyTrend) ?? vdG;
                  const wG = trendGlyph(r.weeklyTrend) ?? vwG;
                  const dimDaily = timeframe === "weekly";
                  const dimWeekly = timeframe === "daily";
                  return (
                    <div key={r.symbol}>
                      {startsGroup && (
                        <div className={`flex items-center gap-2.5 pb-2.5 ${idx === 0 ? "mt-4" : "mt-7"}`}>
                          <span
                            aria-hidden
                            className="h-[5px] w-[5px] rounded-full"
                            style={{
                              background: GROUP_DOT[group],
                              boxShadow:
                                group === "newlyBullish" ? `0 0 8px ${BULL_ACCENT}66` : "none",
                            }}
                          />
                          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
                            {bullGroupLabelFor(group, timeframe)}
                          </p>
                        </div>
                      )}

                      <div
                        className={`${GRID} border-b border-[var(--line)] py-3 transition-colors duration-[var(--dur-micro)] hover:bg-[rgba(232,235,232,0.02)]`}
                        style={
                          r.newlyBullish
                            ? { background: "rgba(127, 158, 232, 0.05)" }
                            : undefined
                        }
                      >
                        <p className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                          {String(r.rank).padStart(3, "0")}
                        </p>

                        <p className="flex min-w-0 items-baseline gap-2.5">
                          <span className="truncate text-sm text-[var(--ink)]">
                            {r.displayName}
                          </span>
                          <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                            {TIER_LABEL[r.tier]}
                          </span>
                          {r.newlyBullish && (
                            <span
                              className="shrink-0 rounded-[2px] px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.2em]"
                              style={{
                                color: BULL_ACCENT,
                                background: "rgba(127, 158, 232, 0.12)",
                              }}
                            >
                              New
                            </span>
                          )}
                        </p>

                        <p
                          className="font-mono text-[10px] uppercase tracking-[0.15em]"
                          style={{ color: BULL_VERDICT_META[r.verdict].color }}
                        >
                          {bullStateLabel(r.verdict, timeframe)}
                        </p>

                        <p
                          className="font-mono text-[11px]"
                          style={{ color: glyphColor(dG), opacity: dimDaily ? 0.3 : 1 }}
                        >
                          {dG}
                        </p>
                        <p
                          className="font-mono text-[11px]"
                          style={{ color: glyphColor(wG), opacity: dimWeekly ? 0.3 : 1 }}
                        >
                          {wG}
                        </p>

                        <p className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">
                          {confirmedCell(r)}
                        </p>

                        <p className="text-right font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
                          {formatX(r.strengthVol)}
                        </p>
                        <p
                          className="text-right font-mono text-[11px] tabular-nums"
                          style={{ color: rsColor(r.rs63) }}
                        >
                          {formatPct(r.rs63)}
                        </p>
                        <p
                          className="text-right font-mono text-[11px] tabular-nums"
                          style={{ color: bullConsensusColor(r.consensus) }}
                        >
                          {formatConsensus(r.consensus)}
                        </p>
                        <p className="text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
                          {formatPrice(r.lastClose)}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* methodology footnote — swaps per strategy (spec §5) */}
          <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--ink-3)]">
            {FOOTNOTE_BY_STRATEGY[strategy] ?? FOOTNOTE_BY_STRATEGY[DEFAULT_STRATEGY_ID]}
          </p>
        </div>
      </div>

      {/* ── bottom chrome ── */}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-between border-t border-[var(--line)] bg-[rgba(6,7,7,0.55)] px-6 backdrop-blur-md md:px-10">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          P·05 — Bull Market Finder
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          Trend-state readouts on free data feeds · not investment advice
        </p>
      </footer>
    </motion.main>
  );
}
