/* Crypto fundamentals scorecard (roadmap #82). Server-rendered: tables and small SVG charts, no client JS. */
import { CRYPTO_GROUP_LABEL, CRYPTO_GROUP_ORDER, CRYPTO_PROJECTS, QUANT_NOTE, type CryptoSnapshot, type MonthPoint, type ProjectSnapshot } from "@a3ro/oil-backend";
import { assetBySlug } from "../../../lib/assets";
import CryptoValuation from "./CryptoValuation";

const ACCENT = "#9ab8ff";
const LINE_COLOURS = ["#9ab8ff", "#b8e278", "#f0b35a", "#e58ad0", "#7fd6c2", "#d9d9d9"];

export function money(v: number | null): string {
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e11 ? 0 : 1)}bn`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}
const pct = (v: number | null, d = 1) => (v === null ? "—" : `${(v * 100).toFixed(d)}%`);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Complete months only: drops the current, partial month. */
const complete = (pts: MonthPoint[], asOf: string) => pts.filter((p) => p.month < asOf.slice(0, 7));

function FeeBars({ pts }: { pts: MonthPoint[] }) {
  const last = pts.slice(-12);
  if (last.length < 2) return <span className="text-[var(--ink-3)]">—</span>;
  const max = Math.max(...last.map((p) => p.value), 1);
  const w = 84, h = 22, bw = w / last.length;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Monthly fees, ${monthLabel(last[0].month)} to ${monthLabel(last[last.length - 1].month)}`}>
    {last.map((p, i) => { const bh = Math.max(1, (p.value / max) * (h - 2)); return <rect key={p.month} x={i * bw + 0.5} y={h - bh} width={bw - 1.5} height={bh} fill={ACCENT} fillOpacity={i === last.length - 1 ? 0.95 : 0.45}><title>{`${monthLabel(p.month)}: ${money(p.value)}`}</title></rect>; })}
  </svg>;
}

function ShareChart({ series }: { series: { name: string; pts: MonthPoint[] }[] }) {
  const months = [...new Set(series.flatMap((s) => s.pts.map((p) => p.month)))].sort();
  if (months.length < 2) return null;
  const W = 640, H = 240, L = 36, R = 96, T = 10, B = 24;
  const max = Math.min(1, Math.ceil(Math.max(...series.flatMap((s) => s.pts.map((p) => p.value)), 0.1) * 10) / 10);
  const x = (m: string) => L + (months.indexOf(m) / (months.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, max / 2, max];
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Share of all DeFi value locked, by chain, month by month">
    {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">{Math.round(t * 100)}%</text></g>)}
    {[months[0], months[Math.floor(months.length / 2)], months[months.length - 1]].map((m) => <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{monthLabel(m)}</text>)}
    {series.map((s, i) => {
      const pts = s.pts.filter((p) => months.includes(p.month));
      if (pts.length < 2) return null;
      return <polyline key={s.name} points={pts.map((p) => `${x(p.month)},${y(p.value)}`).join(" ")} fill="none" stroke={LINE_COLOURS[i % LINE_COLOURS.length]} strokeWidth={i === 0 ? 2 : 1.5} />;
    })}
    {labelPositions(series.map((s, i) => ({ i, name: s.name, end: s.pts[s.pts.length - 1] })).filter((l) => l.end), y, T, H - B).map((l) => (
      <text key={l.name} x={W - R + 6} y={l.y + 3} fontSize="10" fill={LINE_COLOURS[l.i % LINE_COLOURS.length]}>{l.name} {pct(l.end.value, 1)}</text>
    ))}
  </svg>;
}

/** End labels in a column at the right, nudged apart so close lines stay readable. */
function labelPositions<L extends { end: MonthPoint }>(labels: L[], y: (v: number) => number, top: number, bottom: number, gap = 12): (L & { y: number })[] {
  const placed = labels.map((l) => ({ ...l, y: y(l.end.value) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < placed.length; k++) if (placed[k].y - placed[k - 1].y < gap) placed[k].y = placed[k - 1].y + gap;
  const over = placed.length ? placed[placed.length - 1].y - bottom : 0;
  if (over > 0) for (const l of placed) l.y = Math.max(top, l.y - over);
  return placed;
}

function StablecoinSection({ snap }: { snap: CryptoSnapshot }) {
  const t = snap.totals;
  const now = t.stablecoins;
  const g = (then: number | null | undefined) => (now && then ? now / then - 1 : null);
  const g30 = g(t.stablecoins30dAgo), g365 = g(t.stablecoins365dAgo);
  const months = complete(t.stablecoinsMonthly ?? [], snap.asOf).slice(-13);
  const byChain = CRYPTO_PROJECTS.filter((p) => p.chain).map((p) => ({ name: p.name, v: snap.projects.find((x) => x.id === p.id)?.stablecoins ?? 0 })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
  const shown = byChain.slice(0, 6), other = now ? now - shown.reduce((a, c) => a + c.v, 0) : 0;
  const rows = [...shown, ...(other > 0 ? [{ name: "Other chains", v: other }] : [])];
  const signed = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`);
  const max = months.length ? Math.max(...months.map((m) => m.value)) : 0;
  return <section aria-label="Stablecoins" className="flex flex-col gap-3">
    <h2 className="landing-kicker">Stablecoins: the dollars in crypto</h2>
    <p className="max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">Dollar stablecoins are the cash of crypto. Growing supply means fresh money is coming in; where they sit shows which chains people actually pay and trade on.</p>
    <dl className="grid grid-cols-3 gap-4">
      <div><dt className="text-xs text-[var(--ink-3)]">Supply now</dt><dd className="mt-1 font-mono text-xl">{money(now)}</dd></div>
      <div><dt className="text-xs text-[var(--ink-3)]">Change, 30 days</dt><dd className="mt-1 font-mono text-xl">{signed(g30)}</dd></div>
      <div><dt className="text-xs text-[var(--ink-3)]">Change, 12 months</dt><dd className="mt-1 font-mono text-xl">{signed(g365)}</dd></div>
    </dl>
    <div className="grid gap-6 md:grid-cols-2">
      {months.length > 1 ? <div>
        <p className="text-[10px] text-[var(--ink-3)]">Total supply at each month-end</p>
        <svg viewBox="0 0 320 90" className="mt-1 h-auto w-full max-w-md" role="img" aria-label={`Stablecoin supply by month, ${monthLabel(months[0].month)} to ${monthLabel(months[months.length - 1].month)}`}>
          {months.map((m, i) => { const bw = 320 / months.length, h = max ? (m.value / max) * 74 : 0; return <g key={m.month}>
            <rect x={i * bw + 1} y={78 - h} width={bw - 3} height={h} fill={ACCENT} fillOpacity={i === months.length - 1 ? 0.9 : 0.4}><title>{`${monthLabel(m.month)}: ${money(m.value)}`}</title></rect>
            {i === 0 || i === months.length - 1 ? <text x={i * bw + bw / 2} y="89" textAnchor="middle" fontSize="8" fill="var(--ink-3)">{monthLabel(m.month)}</text> : null}
          </g>; })}
        </svg>
      </div> : null}
      <div>
        <p className="text-[10px] text-[var(--ink-3)]">Where they sit</p>
        <ul className="mt-2 flex flex-col gap-1.5">{rows.map((c) => <li key={c.name} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs">
          <span className="text-[var(--ink-2)]">{c.name}</span>
          <span className="h-1.5 rounded-sm bg-[var(--line)]"><span className="block h-1.5 rounded-sm" style={{ width: `${now ? (c.v / now) * 100 : 0}%`, background: ACCENT }} /></span>
          <span className="text-right font-mono">{now ? `${((c.v / now) * 100).toFixed(1)}%` : "—"}</span>
        </li>)}</ul>
      </div>
    </div>
  </section>;
}

function change(pts: MonthPoint[]): number | null {
  if (pts.length < 13) return null;
  return pts[pts.length - 1].value - pts[pts.length - 13].value;
}

export default function CryptoFundamentalsView({ snap }: { snap: CryptoSnapshot | null }) {
  const byId = new Map((snap?.projects ?? []).map((p) => [p.id, p]));
  const chainSeries = CRYPTO_PROJECTS.filter((p) => p.chain && (byId.get(p.id)?.tvlShareMonthly.length ?? 0) > 1)
    .map((p) => ({ name: p.symbol === "—" ? p.name : p.symbol, pts: byId.get(p.id)!.tvlShareMonthly, now: byId.get(p.id)!.tvlShare ?? 0 }))
    .sort((a, b) => b.now - a.now).slice(0, 6);
  const eth = byId.get("ethereum");
  const ethChange = eth ? change(eth.tvlShareMonthly) : null;

  return <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-20 pt-36 md:px-10">
    <header className="flex flex-col gap-3">
      <p className="landing-kicker">P·04 / Crypto</p>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Who pays to use it?</h1>
      <p className="max-w-3xl text-sm leading-relaxed text-[var(--ink-2)]">
        One yardstick for every project: what users actually pay to use it, what the project keeps, how much value sits in it and how many
        stablecoin dollars live on it. Price is left out on purpose. A token can rise with no one using the network; these numbers show who is.
      </p>
      <p className="text-xs text-[var(--ink-3)]">{snap ? `Data as of ${snap.asOf} · ` : ""}Source: <a className="underline" href="https://defillama.com" target="_blank" rel="noreferrer">DefiLlama</a> (open data), updated daily. General information, not a recommendation.</p>
    </header>

    {!snap ? <p className="rounded-sm border border-[var(--line)] p-4 text-sm text-[var(--ink-2)]">The first daily snapshot hasn&rsquo;t been saved yet. Check back after the next update.</p> : <>
      <dl className="grid grid-cols-2 gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-4">
        <div><dt className="text-xs text-[var(--ink-3)]">Value locked in DeFi</dt><dd className="mt-1 font-mono text-xl">{money(snap.totals.defiTvl)}</dd></div>
        <div><dt className="text-xs text-[var(--ink-3)]">Stablecoins, all chains</dt><dd className="mt-1 font-mono text-xl">{money(snap.totals.stablecoins)}</dd></div>
        <div><dt className="text-xs text-[var(--ink-3)]">Ethereum&rsquo;s share of DeFi</dt><dd className="mt-1 font-mono text-xl">{pct(eth?.tvlShare ?? null)}</dd>
          {ethChange !== null ? <dd className="text-xs text-[var(--ink-3)]">{ethChange >= 0 ? "+" : "−"}{Math.abs(ethChange * 100).toFixed(1)} pts in 12 months</dd> : null}</div>
        <div><dt className="text-xs text-[var(--ink-3)]">Projects tracked</dt><dd className="mt-1 font-mono text-xl">{CRYPTO_PROJECTS.length}</dd></div>
      </dl>

      {chainSeries.length ? <section aria-label="Share of DeFi by chain" className="flex flex-col gap-2">
        <h2 className="landing-kicker">Share of DeFi value locked, by chain</h2>
        <p className="max-w-3xl text-xs text-[var(--ink-3)]">Each chain&rsquo;s share of all value locked in DeFi apps, at each month-end. A falling share means money and activity are moving elsewhere, even if the dollar amount grows.</p>
        <div className="max-w-3xl overflow-x-auto"><div className="min-w-[560px]"><ShareChart series={chainSeries} /></div></div>
      </section> : null}

      <StablecoinSection snap={snap} />

      {CRYPTO_GROUP_ORDER.map((group) => {
        const rows = CRYPTO_PROJECTS.filter((p) => p.group === group)
          .map((p) => ({ p, s: byId.get(p.id) as ProjectSnapshot | undefined }))
          .sort((a, b) => (b.s?.fees30d ?? -1) - (a.s?.fees30d ?? -1));
        return <section key={group} aria-label={CRYPTO_GROUP_LABEL[group]} className="flex flex-col gap-3">
          <h2 className="landing-kicker">{CRYPTO_GROUP_LABEL[group]}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--ink-3)]">
                <th className="py-2 pr-3 font-normal">Project</th>
                <th className="py-2 pr-3 text-right font-normal">Fees, 30 days</th>
                <th className="py-2 pr-3 text-right font-normal">Revenue, 30 days</th>
                <th className="py-2 pr-3 font-normal">Fees by month</th>
                <th className="py-2 pr-3 text-right font-normal">Value locked</th>
                <th className="py-2 pr-3 text-right font-normal">Stablecoins held</th>
              </tr></thead>
              <tbody>{rows.map(({ p, s }) => {
                const asset = p.symbol !== "—" ? assetBySlug(`${p.symbol.toLowerCase()}-usd`) : null;
                return <tr key={p.id} className="border-b border-[var(--line)] align-top">
                  <td className="py-3 pr-3">
                    <span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-[var(--ink-3)]">{asset ? <a className="underline" href={`/assets/${asset.slug}`}>{p.symbol}</a> : p.symbol}</span>
                    <span className="mt-0.5 block max-w-[260px] text-xs leading-relaxed text-[var(--ink-3)]">{p.role}</span>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono">{money(s?.fees30d ?? null)}{s?.fees30d != null ? <span className="block text-[10px] text-[var(--ink-3)]">{money((s.fees30d * 365) / 30)} a year</span> : null}</td>
                  <td className="py-3 pr-3 text-right font-mono">{money(s?.revenue30d ?? null)}</td>
                  <td className="py-3 pr-3"><FeeBars pts={complete(s?.feesMonthly ?? [], snap.asOf)} /></td>
                  <td className="py-3 pr-3 text-right font-mono">{p.chain ? <>{money(s?.tvl ?? null)}<span className="block text-[10px] text-[var(--ink-3)]">{pct(s?.tvlShare ?? null)} of DeFi</span></> : <span className="text-[var(--ink-3)]">n/a</span>}</td>
                  <td className="py-3 pr-3 text-right font-mono">{p.chain && s?.stablecoins != null ? <>{money(s.stablecoins)}<span className="block text-[10px] text-[var(--ink-3)]">{pct(s.stablecoinShare)} of all</span></> : <span className="text-[var(--ink-3)]">{p.chain ? "none" : "n/a"}</span>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </section>;
      })}

      <CryptoValuation meta={CRYPTO_GROUP_ORDER.flatMap((g) => CRYPTO_PROJECTS.filter((p) => p.group === g && p.gecko).map((p) => ({ id: p.id, name: p.name, symbol: p.symbol, groupLabel: CRYPTO_GROUP_LABEL[g] })))} />
    </>}

    <section aria-label="How to read this" className="flex max-w-3xl flex-col gap-2 text-xs leading-relaxed text-[var(--ink-3)]">
      <h2 className="landing-kicker">How to read this</h2>
      <p><b className="text-[var(--ink-2)]">Fees</b>: everything users paid to use the network or app in the last 30 days (for a chain, its transaction fees). <b className="text-[var(--ink-2)]">Revenue</b>: the part the project or its token holders keep, for example fees burned or used for buybacks; fees paid out to miners or validators are not revenue. Both come from DefiLlama&rsquo;s daily figures.</p>
      <p><b className="text-[var(--ink-2)]">Value locked</b>: money deposited in DeFi apps on the chain. <b className="text-[var(--ink-2)]">Stablecoins held</b>: dollar stablecoins issued on the chain, a good guide to where real payments and trading happen.</p>
      <p>Not yet included: active users and developer activity, which aren&rsquo;t in DefiLlama&rsquo;s free data. {QUANT_NOTE} Valuation ratios use market caps, which are market data, so they are part of Premium.</p>
      {snap?.problems.length ? <p>Missing this update: {snap.problems.join("; ")}.</p> : null}
    </section>
  </section>;
}
