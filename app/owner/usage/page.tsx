// Free-tier usage limits (roadmap #50). Database size is measured; services without an API key
// here are linked to their own usage pages rather than guessed.
import { createDb, getDbUsage } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable, mb } from "../ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES = [
  { name: "Loops (newsletter)", limit: "1,000 contacts · 4,000 sends per 30 days", where: "https://app.loops.so/settings?page=billing" },
  { name: "Vercel Hobby", limit: "Function and bandwidth allowances; non-commercial use only", where: "https://vercel.com/dashboard/usage" },
  { name: "Supabase Auth", limit: "50,000 monthly active users", where: "https://supabase.com/dashboard/project/_/settings/billing/usage" },
  { name: "FRED API", limit: "120 requests per minute", where: "https://fred.stlouisfed.org/docs/api/fred/" },
  { name: "EIA API", limit: "Rate-limited per key", where: "https://www.eia.gov/opendata/" },
  { name: "Finnhub (free)", limit: "60 calls per minute; personal use", where: "https://finnhub.io/dashboard" },
  { name: "Alpha Vantage (free)", limit: "25 requests per day", where: "https://www.alphavantage.co/support/" },
];

export default async function UsagePage() {
  await requireOwner();
  const usage = await getDbUsage(await createDb());
  const share = usage.totalBytes / usage.limitBytes;
  const daysLeft = usage.growthBytesPerDay > 0 ? Math.max(0, Math.floor((usage.limitBytes - usage.totalBytes) / usage.growthBytesPerDay)) : null;
  const tone = share >= 0.9 ? "#e5484d" : share >= 0.75 ? "#f5a524" : "var(--ink)";

  return <OpsPage title="Usage limits" intro="Early warning before a free tier stops being free.">
    <OpsSection title="Database (Supabase free plan: 500 MB)">
      <p className="text-3xl font-semibold" style={{ color: tone }}>{mb(usage.totalBytes)} <span className="text-base font-normal text-[var(--ink-3)]">of {mb(usage.limitBytes)} · {Math.round(share * 100)}%</span></p>
      <div className="mt-3 h-2 w-full rounded-sm bg-[var(--line)]"><div className="h-2 rounded-sm" style={{ width: `${Math.min(100, share * 100)}%`, background: tone }} /></div>
      <p className="mt-3 text-xs text-[var(--ink-2)]">
        Growing about {mb(usage.growthBytesPerDay)} a day{daysLeft != null ? <>, so the limit is roughly <strong>{daysLeft} days</strong> away at this rate</> : null}. When a free project goes over, Supabase can make the database read-only.
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <OpsTable cols={["Largest tables", "Size", "Rows"]} rows={usage.tables.map((t) => [t.name, mb(t.bytes), t.rows.toLocaleString()])} />
        <OpsTable cols={["Growing daily", "Rows/day", "Size/day"]} rows={usage.growth.map((g) => [g.name, g.rowsPerDay.toLocaleString(), mb(g.bytesPerDay)])} />
      </div>
    </OpsSection>
    <OpsSection title="Other services" note="Not measured here yet (no usage API connected). Check each on its own dashboard.">
      <OpsTable cols={["Service", "Free limit", "Usage"]} rows={SERVICES.map((s) => [s.name, <span key="l" className="font-sans">{s.limit}</span>, <a key="w" href={s.where} target="_blank" rel="noreferrer" className="underline">Open ↗</a>])} />
    </OpsSection>
  </OpsPage>;
}
