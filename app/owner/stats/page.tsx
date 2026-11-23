// Owner-only site interaction stats (roadmap #46). Middleware already blocks everyone else;
// the page checks again so a matcher mistake can't expose it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createDb, getSiteStats, type SiteStats } from "@a3ro/oil-backend";
import { Nav } from "../../components/Chrome";
import { currentUserIsOwner } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Site stats — A3RO owner", robots: { index: false, follow: false } };

const LABELS: Record<string, string> = { page_view: "Page views", outbound: "Outbound clicks", search: "Searches", asset_view: "Asset opens", signup: "Sign-ups", watch: "Watch clicks" };

function Table({ title, rows, cols, empty = "Nothing yet." }: { title: string; rows: (string | number | null)[][]; cols: string[]; empty?: string }) {
  return <section className="rounded-sm border border-[var(--line)] p-5">
    <h2 className="text-sm font-medium">{title}</h2>
    {rows.length === 0 ? <p className="mt-3 text-xs text-[var(--ink-3)]">{empty}</p> :
      <table className="mt-3 w-full text-xs">
        <thead><tr className="text-left text-[var(--ink-3)]">{cols.map((c, i) => <th key={c} className={`pb-2 font-normal ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[var(--line)]">{r.map((v, j) => <td key={j} className={`py-1.5 ${j ? "text-right font-mono" : "break-all"}`}>{v ?? "—"}</td>)}</tr>)}</tbody>
      </table>}
  </section>;
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!(await currentUserIsOwner())) notFound();
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  let stats: SiteStats | null = null;
  try { stats = await getSiteStats(await createDb(), days); } catch { stats = null; }

  return <main className="relative min-h-screen">
    <Nav />
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-20 pt-32 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="landing-kicker">Owner · not public</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Site stats</h1>
          <p className="mt-1 text-xs text-[var(--ink-3)]">Anonymous events: no names, emails or IP addresses. Clicks inside TradingView widgets can&rsquo;t be seen.</p>
        </div>
        <nav className="flex gap-4 font-mono text-xs">{[7, 30, 90].map((d) => <a key={d} href={`?days=${d}`} className={d === days ? "text-[var(--ink)] underline" : "text-[var(--ink-3)]"}>{d} days</a>)}</nav>
      </header>

      {!stats ? <p className="text-sm text-[var(--ink-2)]">Stats aren&rsquo;t available. If the table is new, run <code>npm --prefix backend run migrate:events</code>.</p> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {Object.keys(LABELS).map((type) => <div key={type} className="rounded-sm border border-[var(--line)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{LABELS[type]}</p>
            <p className="mt-2 text-2xl font-semibold">{stats!.totals.find((t) => t.type === type)?.count ?? 0}</p>
          </div>)}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Table title="Top pages" cols={["Page", "Views"]} rows={stats.topPages.map((r) => [r.path, r.count])} />
          <Table title="Outbound clicks by destination" cols={["Site", "Clicks"]} rows={stats.outbound.map((r) => [r.target, r.count])} />
          <Table title="Searches" cols={["Term", "Searches", "No results"]} rows={stats.searches.map((r) => [r.target, r.count, r.noResults])} />
          <Table title="Assets opened" cols={["Asset", "Opens"]} rows={stats.assets.map((r) => [r.target, r.count])} />
          <Table title="Sign-ups by page" cols={["Page", "Form", "Sign-ups"]} rows={stats.signups.map((r) => [r.path, r.target, r.count])} />
          <Table title="Page views per day" cols={["Day", "Views"]} rows={stats.daily.map((r) => [r.day, r.pageViews])} />
        </div>
      </>}
    </div>
  </main>;
}
