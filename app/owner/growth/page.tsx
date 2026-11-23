// Growth (roadmap #51): leads, waitlist sign-ups and site interaction in one place.
import { createDb, getGrowthSummary } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable } from "../ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYDNEY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });

export default async function GrowthPage() {
  await requireOwner();
  const g = await getGrowthSummary(await createDb());
  const tiles = [
    { label: "Leads (all time)", value: g.leads.total },
    { label: "Leads, last 30 days", value: g.leads.last30 },
    { label: "Sign-ups, last 30 days", value: g.signups30 },
    { label: "Page views, last 30 days", value: g.pageViews30 },
    { label: "Outbound clicks, last 30 days", value: g.outbound30 },
  ];
  return <OpsPage title="Growth" intro={<>Leads come from the contact and waitlist forms (<code>/api/leads</code>). Newsletter subscribers live in Loops. Detail on interactions is in <a href="/owner/stats" className="underline">Site stats</a>.</>}>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((t) => <div key={t.label} className="rounded-sm border border-[var(--line)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{t.label}</p>
        <p className="mt-2 text-2xl font-semibold">{t.value.toLocaleString()}</p>
      </div>)}
    </div>
    <div className="grid gap-5 md:grid-cols-[1fr_1.4fr]">
      <OpsSection title="Leads by form">
        <OpsTable cols={["Form", "Leads"]} rows={g.leads.byContext.map((r) => [r.context, r.count])} />
      </OpsSection>
      <OpsSection title="Latest leads" note="Personal information: don't share or export without a reason.">
        <OpsTable cols={["Email", "Form", "Date"]} rows={g.leads.recent.map((r) => [r.email, r.context ?? "contact form", SYDNEY.format(new Date(r.createdAt))])} />
      </OpsSection>
    </div>
  </OpsPage>;
}
