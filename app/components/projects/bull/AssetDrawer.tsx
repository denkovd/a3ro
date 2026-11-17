"use client";
/* ────────────────────────────────────────────────────────────────
   Bull Market Finder — asset drawer (P·02, Phase 2).

   Opens over the ranked table when a row is clicked. Shows how every
   strategy lens reads the asset, both Money Line legs' flip levels
   (the "next flip" price, distance to it, last flip), the context
   metrics, and the asset's verdict changes over the last 90 days.

   Data: the clicked table row renders the header instantly; the
   full every-lens read comes from /api/bull/asset (useBullAsset).
   The chart (chart/BullChart.tsx) sits at the top; company / crypto
   details + earnings (Phase 4) slot in as further sections.

   Keyboard: Esc closes (and marks the event handled so the page's
   "Esc leaves the module" handler ignores it); ↑ / ↓ step to the
   previous / next asset in the table's current order.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import BullChart from "./chart/BullChart";
import {
  useBullAsset,
  bullStateLabel,
  bullConsensusColor,
  formatCompact,
  formatConsensus,
  formatDate,
  formatDaysSince,
  formatPct,
  formatPrice,
  formatX,
  rsBenchmarkLabel,
  BULL_ACCENT,
  BULL_MUTED_AMBER,
  BULL_MUTED_PINK,
  BULL_VERDICT_META,
  DEFAULT_STRATEGY_ID,
  TIER_LABEL,
  type BullAssetDetails,
  type BullEarnings,
  type BullRow,
  type StrategyMeta,
} from "./bullData";

type Props = {
  symbol: string;
  /** The table's row for the active lens, if loaded — instant header. */
  row: BullRow | null;
  strategy: string;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  /** Position in the table's current order; null if not in view. */
  position: { index: number; total: number } | null;
};

const trendWord = (t: number | null) =>
  t === 1 ? "Bullish" : t === -1 ? "Bearish" : t === 0 ? "Warm-up" : "—";
const trendGlyph = (t: number | null) => (t === 1 ? "▲" : t === -1 ? "▼" : "·");
const trendColor = (t: number | null) =>
  t === 1 ? BULL_ACCENT : t === -1 ? BULL_MUTED_PINK : "var(--ink-3)";
const signedColor = (v: number | null) =>
  v === null ? "var(--ink-3)" : v > 0 ? BULL_ACCENT : v < 0 ? BULL_MUTED_PINK : "var(--ink-2)";

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)]">
      {children}
    </p>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="text-[12px] text-[var(--ink-3)]">{label}</span>
      <span
        className="font-mono text-[12px] tabular-nums"
        style={{ color: color ?? "var(--ink-2)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── one Money Line leg: the flip-level card ── */
function LegCard({
  leg, trend, line, cushion, flipDate, flipPrice, sinceFlip, barsSince, lastClose, asOf,
}: {
  leg: "daily" | "weekly";
  trend: number | null;
  line: number | null;
  cushion: number | null;
  flipDate: string | null;
  flipPrice: number | null;
  sinceFlip: number | null;
  barsSince: number | null;
  lastClose: number | null;
  asOf: string | null;
}) {
  const distance =
    line !== null && lastClose !== null && lastClose !== 0 ? (line / lastClose - 1) * 100 : null;
  const close = leg === "daily" ? "daily close" : "weekly close";
  const sentence =
    trend === 1 && line !== null
      ? `Turns bearish on a ${close} below ${formatPrice(line)}.`
      : trend === -1 && line !== null
        ? `Turns bullish on a ${close} above ${formatPrice(line)}.`
        : trend === 0
          ? "Not enough history to establish a trend yet."
          : "Flip level not available for this scan.";
  const held =
    barsSince === null ? "—" : leg === "daily" ? `${barsSince} sessions` : `${barsSince} weeks`;

  return (
    <div className="rounded-sm hairline bg-[var(--depth-2)] px-4 py-4">
      <div className="flex items-baseline justify-between">
        <Label>{leg === "daily" ? "Daily leg" : "Weekly leg"}</Label>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: trendColor(trend) }}>
          {trendGlyph(trend)} {trendWord(trend)}
        </span>
      </div>

      <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        Next flip level
      </p>
      <p className="mt-1 flex items-baseline gap-2.5">
        <span className="font-mono text-xl tabular-nums text-[var(--ink)]">{formatPrice(line)}</span>
        {distance !== null && (
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-2)]">
            {Math.abs(distance).toFixed(Math.abs(distance) < 10 ? 2 : 1)}%{" "}
            {distance < 0 ? "below" : distance > 0 ? "above" : "at"} price
          </span>
        )}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-2)]">{sentence}</p>

      <div className="mt-3">
        <Stat label="Cushion vs level" value={formatPct(cushion)} color={signedColor(cushion)} />
        <Stat label="Last flip" value={flipDate ? `${formatDate(flipDate)} · ${formatPrice(flipPrice)}` : "—"} />
        <Stat label="Move since flip" value={formatPct(sinceFlip)} color={signedColor(sinceFlip)} />
        <Stat label="Held for" value={held} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">
        Level as of {formatDate(asOf)} close. It ratchets with each close in the trend&apos;s favour
        {leg === "weekly" ? "; the forming week never counts" : ""}.
      </p>
    </div>
  );
}

/* ── fundamentals ── */

const HOUR_LABEL: Record<string, string> = {
  bmo: "before market open",
  amc: "after market close",
  dmh: "during market hours",
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((t - today) / 86_400_000);
}

const fmtNum = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));
const fmtYear = (iso: string | null) => (iso ? `${formatDate(iso)} ${iso.slice(0, 4)}` : "—");

/** Low ── ● ── High with the last close marked. */
function RangeBar({ low, high, price }: { low: number | null; high: number | null; price: number | null }) {
  if (low === null || high === null || high <= low) return <span className="font-mono text-[12px] text-[var(--ink-3)]">—</span>;
  const pos = price === null ? null : Math.min(Math.max((price - low) / (high - low), 0), 1);
  return (
    <div className="w-full">
      <div className="relative h-[3px] rounded-full bg-[var(--depth-3)]">
        {pos !== null && (
          <span
            aria-hidden
            className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${pos * 100}%`, background: BULL_ACCENT, boxShadow: `0 0 8px ${BULL_ACCENT}66` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
        <span>{formatPrice(low)}</span>
        {pos !== null && <span className="text-[var(--ink-2)]">{Math.round(pos * 100)}% of range</span>}
        <span>{formatPrice(high)}</span>
      </div>
    </div>
  );
}

function CompanyDetails({ d, price }: { d: BullAssetDetails; price: number | null }) {
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        {d.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoUrl} alt="" width={28} height={28} referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-sm bg-white/90 object-contain p-0.5" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--ink)]">{d.name ?? "—"}</p>
          <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            {[d.industry, d.exchange, d.country].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {d.website && (
          <a href={d.website} target="_blank" rel="noopener noreferrer"
            className="sweep ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-2)] hover:text-[var(--ink)]">
            Website ↗
          </a>
        )}
      </div>
      <div className="mt-3">
        <Stat label={`Market cap${d.marketCapAsOf ? ` (${formatDate(d.marketCapAsOf)})` : ""}`} value={formatCompact(d.marketCap)} />
        <Stat label="Shares outstanding" value={formatCompact(d.sharesOutstanding, "")} />
        <Stat label="P/E (TTM)" value={d.peTtm === null ? "—" : `${fmtNum(d.peTtm, 1)}×`} />
        <Stat label="Beta" value={fmtNum(d.beta)} />
        <Stat label="Dividend yield" value={d.dividendYieldPct === null ? "—" : `${fmtNum(d.dividendYieldPct)}%`} />
        <Stat label="Listed since" value={fmtYear(d.ipoDate)} />
      </div>
      <div className="mt-3">
        <p className="mb-2 text-[12px] text-[var(--ink-3)]">52-week range</p>
        <RangeBar low={d.week52Low} high={d.week52High} price={price} />
      </div>
    </>
  );
}

function CoinDetails({ d }: { d: BullAssetDetails }) {
  const issued =
    d.circulatingSupply !== null && d.maxSupply !== null && d.maxSupply > 0
      ? (d.circulatingSupply / d.maxSupply) * 100
      : null;
  return (
    <div className="mt-2">
      <Stat
        label={`Market cap${d.marketCapRank !== null ? ` · rank #${d.marketCapRank}` : ""}`}
        value={formatCompact(d.marketCap)}
      />
      <Stat label="24h volume" value={formatCompact(d.volume24h)} />
      <Stat label="Circulating supply" value={formatCompact(d.circulatingSupply, "")} />
      <Stat
        label="Max supply"
        value={d.maxSupply === null ? "No cap" : `${formatCompact(d.maxSupply, "")}${issued !== null ? ` · ${issued.toFixed(1)}% issued` : ""}`}
      />
      <Stat label={`All-time high${d.athDate ? ` (${fmtYear(d.athDate)})` : ""}`} value={formatPrice(d.ath)} />
      <Stat label="From all-time high" value={formatPct(d.athChangePct)} color={signedColor(d.athChangePct)} />
    </div>
  );
}

function EarningsBlock({ e }: { e: BullEarnings }) {
  const days = daysUntil(e.nextDate);
  const showRevenue = e.quarters.some((q) => q.revenueActual !== null);
  return (
    <div className="mt-2">
      <div className="rounded-sm hairline bg-[var(--depth-2)] px-4 py-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Next report</p>
        {e.nextDate ? (
          <p className="mt-1 text-[13px] text-[var(--ink)]">
            {fmtYear(e.nextDate)}
            {e.nextHour && HOUR_LABEL[e.nextHour] ? <span className="text-[var(--ink-2)]"> · {HOUR_LABEL[e.nextHour]}</span> : null}
            {days !== null && days >= 0 && (
              <span className="ml-2 font-mono text-[11px]" style={{ color: days <= 7 ? BULL_MUTED_AMBER : "var(--ink-3)" }}>
                {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">No date announced in the next 90 days.</p>
        )}
      </div>

      {e.quarters.length > 0 ? (
        <div className="mt-3">
          <div className="grid grid-cols-[4.5rem_1fr_1fr_4.5rem] gap-x-3 border-b border-[var(--line)] pb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            <span>Quarter</span>
            <span className="text-right">EPS act / est</span>
            <span className="text-right">{showRevenue ? "Revenue act" : ""}</span>
            <span className="text-right">Surprise</span>
          </div>
          {e.quarters.map((q) => (
            <div key={`${q.year}Q${q.quarter}`}
              className="grid grid-cols-[4.5rem_1fr_1fr_4.5rem] items-baseline gap-x-3 border-b border-[var(--line)] py-2 font-mono text-[11px] tabular-nums last:border-b-0">
              <span className="text-[var(--ink-2)]">Q{q.quarter} FY{String(q.year).slice(2)}</span>
              <span className="text-right text-[var(--ink-2)]">
                {fmtNum(q.epsActual)} <span className="text-[var(--ink-3)]">/ {fmtNum(q.epsEstimate)}</span>
              </span>
              <span className="text-right text-[var(--ink-3)]">
                {showRevenue ? formatCompact(q.revenueActual) : ""}
              </span>
              <span className="text-right" style={{ color: signedColor(q.epsSurprisePct) }}>
                {formatPct(q.epsSurprisePct)}
              </span>
            </div>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Surprise = EPS vs consensus estimate.{" "}
            {e.source === "earnings-beat"
              ? "From the Earnings Beat tracker (Finnhub, incl. revenue)."
              : "Finnhub reported EPS history."}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[var(--ink-3)]">No reported quarters on file yet.</p>
      )}
    </div>
  );
}

export default function AssetDrawer({ symbol, row, strategy, onClose, onStep, position }: Props) {
  const reduced = useReducedMotion();
  const asset = useBullAsset(symbol);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Prefer the drawer's own fetch; fall back to the table row.
  const lensRow = (id: string) => asset.lenses.find((l) => l.strategy === id) ?? null;
  const active = lensRow(strategy) ?? row;
  // Both legs are computed identically for every lens — read them from D×W.
  const legs = lensRow(DEFAULT_STRATEGY_ID) ?? active;
  const strategies: StrategyMeta[] = asset.strategies;
  const activeMeta = strategies.find((s) => s.id === strategy);
  const name = active?.displayName ?? symbol;
  const bench = active ? rsBenchmarkLabel(active) : null;

  // Focus the close button on open; return focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  // Capture phase so this runs before the page's bubble-phase Esc handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); onStep(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); onStep(-1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onStep]);

  return (
    <>
      {/* backdrop — click to close; keeps the chrome bars usable */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-x-0 bottom-12 top-14 z-[35] bg-[rgba(4,5,5,0.45)]"
      />
      <motion.aside
        role="dialog"
        aria-label={`${name} — asset details`}
        data-lenis-prevent
        initial={reduced ? false : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="fixed bottom-12 right-0 top-14 z-40 w-full overflow-y-auto overscroll-contain border-l border-[var(--line)] bg-[var(--depth-1)] sm:w-[34rem]"
      >
        {/* sticky header */}
        <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[rgba(11,13,13,0.92)] px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onStep(-1)}
                aria-label="Previous asset"
                className="rounded-[2px] border border-[var(--line)] px-2 py-1 font-mono text-[10px] text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onStep(1)}
                aria-label="Next asset"
                className="rounded-[2px] border border-[var(--line)] px-2 py-1 font-mono text-[10px] text-[var(--ink-3)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
              >
                ↓
              </button>
              {position && (
                <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.2em] tabular-nums text-[var(--ink-3)]">
                  {position.index + 1} / {position.total}
                </span>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:text-[var(--ink)]"
            >
              Close · Esc
            </button>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight text-[var(--ink)]">{name}</h2>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                <span>{symbol}</span>
                {active && <span>{TIER_LABEL[active.tier]}</span>}
                {active?.newlyBullish && (
                  <span className="rounded-[2px] px-1.5 py-px" style={{ color: BULL_ACCENT, background: "rgba(127, 158, 232, 0.12)" }}>
                    New
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-lg tabular-nums text-[var(--ink)]">{formatPrice(active?.lastClose ?? null)}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Close {formatDate(active?.lastCloseDate ?? null)}
              </p>
            </div>
          </div>
          {active && (
            <p
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em]"
              style={{ color: BULL_VERDICT_META[active.verdict].color }}
            >
              {activeMeta?.label ?? "Active lens"} ·{" "}
              {bullStateLabel(active.verdict, activeMeta?.timeframe ?? "multi")}
              {active.rank ? <span className="text-[var(--ink-3)]"> · rank {active.rank}</span> : null}
            </p>
          )}
        </div>

        <div className="space-y-8 px-6 pb-12 pt-6">
          {asset.status === "error" && (
            <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
              Couldn&apos;t load the full read for this asset
              {asset.errorMessage ? ` (${asset.errorMessage})` : ""}. Showing the table row only.
            </p>
          )}
          {asset.status === "pending" && (
            <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
              This asset wasn&apos;t scored on the latest scan — usually a data-source gap on that day.
            </p>
          )}

          {/* chart — price + Money Line flip levels (+ future signals) */}
          <section>
            <Label>Chart</Label>
            <div className="mt-3">
              <BullChart key={symbol} symbol={symbol} />
            </div>
          </section>

          {/* every lens */}
          <section>
            <Label>How each lens reads it</Label>
            <div className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-sm hairline bg-[var(--line)] sm:grid-cols-3">
              {strategies.map((s) => {
                const l = lensRow(s.id);
                const isActive = s.id === strategy;
                const confirmed =
                  l?.verdict === "CONFLICT_DAILY" ? l.dailyFlipDate
                    : l?.verdict === "CONFLICT_WEEKLY" ? l.weeklyFlipDate
                      : l?.alignedSince ?? null;
                return (
                  <div
                    key={s.id}
                    className="bg-[var(--depth-1)] px-4 py-3"
                    style={isActive ? { background: "rgba(127, 158, 232, 0.06)" } : undefined}
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
                      {s.label}
                    </p>
                    {l ? (
                      <>
                        <p
                          className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em]"
                          style={{ color: BULL_VERDICT_META[l.verdict].color }}
                        >
                          {bullStateLabel(l.verdict, s.timeframe)}
                        </p>
                        <p className="mt-1 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                          {formatDate(confirmed)}
                          {l.daysSinceAligned !== null && l.verdict !== "CONFLICT_DAILY" && l.verdict !== "CONFLICT_WEEKLY"
                            ? ` · ${formatDaysSince(l.daysSinceAligned)}`
                            : ""}
                          {" · #"}
                          {l.rank}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 font-mono text-[11px] text-[var(--ink-3)]">
                        {asset.status === "loading" ? "…" : "—"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* flip levels */}
          <section>
            <Label>Flip levels</Label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LegCard
                leg="daily"
                trend={legs?.dailyTrend ?? null}
                line={legs?.dailyLine ?? null}
                cushion={legs?.dailyCushionPct ?? null}
                flipDate={legs?.dailyFlipDate ?? null}
                flipPrice={legs?.dailyFlipPrice ?? null}
                sinceFlip={legs?.dailySinceFlipPct ?? null}
                barsSince={legs?.dailyBarsSinceFlip ?? null}
                lastClose={legs?.lastClose ?? null}
                asOf={legs?.lastCloseDate ?? null}
              />
              <LegCard
                leg="weekly"
                trend={legs?.weeklyTrend ?? null}
                line={legs?.weeklyLine ?? null}
                cushion={legs?.weeklyCushionPct ?? null}
                flipDate={legs?.weeklyFlipDate ?? null}
                flipPrice={legs?.weeklyFlipPrice ?? null}
                sinceFlip={legs?.weeklySinceFlipPct ?? null}
                barsSince={legs?.weeklyBarsSinceFlip ?? null}
                lastClose={legs?.lastClose ?? null}
                asOf={legs?.lastCloseDate ?? null}
              />
            </div>
          </section>

          {/* context metrics */}
          <section>
            <Label>Context</Label>
            <div className="mt-2">
              <Stat label="Str ×vol (active lens)" value={formatX(active?.strengthVol ?? null)} />
              <Stat
                label={bench ? `RS 63d vs ${bench}` : "RS 63d (no benchmark)"}
                value={formatPct(active?.rs63 ?? null)}
                color={signedColor(active?.rs63 ?? null)}
              />
              <Stat label="ATR 14d (% of price)" value={active?.atrPct == null ? "—" : `${active.atrPct.toFixed(2)}%`} />
              <Stat
                label="Lens consensus (bullish of lenses)"
                value={active ? formatConsensus(active.consensus) : "—"}
                color={active ? bullConsensusColor(active.consensus) : undefined}
              />
              {active?.adjusted && (
                <Stat label="Series" value="Roll-adjusted continuous" />
              )}
            </div>
          </section>

          {/* company / coin fundamentals (Phase 4) */}
          {asset.details?.provider === "finnhub" && (
            <section>
              <Label>{active?.tier === "etf" ? "Fund details" : "Company"}</Label>
              <CompanyDetails d={asset.details} price={active?.lastClose ?? null} />
              <p className="mt-3 text-[11px] text-[var(--ink-3)]">
                Data: Finnhub · profile refreshed {formatDate(asset.details.fetchedAt?.slice(0, 10) ?? null)}
                {asset.details.marketCapMethod === "shares × last close" ? " · market cap = shares × last close" : ""}
              </p>
            </section>
          )}
          {asset.details?.provider === "coingecko" && (
            <section>
              <Label>Coin</Label>
              <CoinDetails d={asset.details} />
              <p className="mt-3 text-[11px] text-[var(--ink-3)]">
                Data: CoinGecko · updated {formatDate(asset.details.fetchedAt?.slice(0, 10) ?? null)}
              </p>
            </section>
          )}
          {asset.status === "live" && !asset.details && active && (
            <p className="text-[12px] leading-relaxed text-[var(--ink-3)]">
              {active.tier === "macro" && active.assetClass !== "crypto"
                ? "Macro asset — no company or coin fundamentals apply."
                : "Details for this asset haven't been loaded yet — they arrive with the next profiles refresh."}
            </p>
          )}
          {asset.earnings && active?.tier !== "etf" && (
            <section>
              <Label>Earnings</Label>
              <EarningsBlock e={asset.earnings} />
            </section>
          )}

          {/* recent transitions */}
          <section>
            <Label>State changes — last 90 days</Label>
            <div className="mt-2">
              {asset.status === "loading" && (
                <p className="py-2 text-[12px] text-[var(--ink-3)]">Loading…</p>
              )}
              {asset.status !== "loading" && asset.transitions.length === 0 && (
                <p className="py-2 text-[12px] text-[var(--ink-3)]">No state changes on any lens in the last 90 days.</p>
              )}
              {asset.transitions.map((t) => {
                const meta = strategies.find((s) => s.id === t.strategy);
                const tf = meta?.timeframe ?? "multi";
                return (
                  <div
                    key={`${t.runDate}-${t.strategy}`}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0"
                  >
                    <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                      {formatDate(t.runDate)} · {meta?.label ?? t.strategy}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      <span className="text-[var(--ink-3)]">
                        {t.fromVerdict ? bullStateLabel(t.fromVerdict, tf) : "new"} →{" "}
                      </span>
                      <span style={{ color: BULL_VERDICT_META[t.toVerdict].color }}>
                        {bullStateLabel(t.toVerdict, tf)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
            Scan {formatDate(asset.runDate ?? active?.runDate ?? null)} · trend-state readouts on free data
            feeds · not investment advice. ↑ ↓ step through the table in its current order.
          </p>
        </div>
      </motion.aside>
    </>
  );
}
