// Module scorecard (roadmap #53) — also the data health overview (#47 light).
import { createDb, getModuleSettings, getModuleSignals } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { computeScorecard, REFRESH_CADENCE_HOURS, WEIGHTS, type ScoreRow } from "../../../lib/scorecard";
import { OpsPage, OpsSection, OpsTable, ago } from "../ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERDICT = { invest: "Invest / upgrade", keep: "Keep", park: "Park" } as const;

export default async function ScorecardPage() {
  await requireOwner();
  const db = await createDb();
  const [signals, settings] = await Promise.all([getModuleSignals(db), getModuleSettings(db).catch(() => [])]);
  const rows: ScoreRow[] = computeScorecard({ ...signals, fitRatings: Object.fromEntries(settings.map((s) => [s.moduleId, s.fitRating])) });
  const noUsage = rows.every((r) => r.usage === null);

  return <OpsPage title="Module scorecard" intro={<>Health {WEIGHTS.health} · Usage {WEIGHTS.usage} · Cost {WEIGHTS.cost} · Upkeep {WEIGHTS.upkeep} · Fit {WEIGHTS.fit}. 70+ invest or upgrade to our own, 40–69 keep, under 40 park. Last 7 days. Set fit ratings in <a href="/owner/controls" className="underline">Controls</a>.</>}>
    {noUsage ? <p className="text-xs text-[var(--ink-2)]">No usage events yet, so usage is left out and the other parts are scaled up to 100.</p> : null}
    <OpsSection title="Scores">
      <OpsTable cols={["Module", "Health", "Usage", "Cost", "Upkeep", "Fit", "Total", "Verdict", "Notes"]}
        rows={rows.map((r) => [r.label, r.health, r.usage ?? "—", r.cost, r.upkeep, r.fit, <strong key="t">{r.total}</strong>, VERDICT[r.verdict], <span key="n" className="font-sans text-[var(--ink-3)]">{r.notes.join("; ") || "—"}</span>])} />
    </OpsSection>
    <OpsSection title="Data freshness" note="Time since each module's data last refreshed, against its schedule.">
      <OpsTable cols={["Module", "Last refresh", "Expected every", "Status"]}
        rows={Object.entries(REFRESH_CADENCE_HOURS).map(([id, cadence]) => {
          const age = signals.lastRefreshHours[id] ?? null;
          const status = age == null ? "missing" : age <= cadence ? "fresh" : age <= cadence * 2 ? "late" : "stale";
          return [id, `${ago(age)} ago`, ago(cadence), status];
        })} />
      {signals.australiaHealthyShare != null ? <p className="mt-3 text-xs text-[var(--ink-3)]">Australia Watch: {Math.round(signals.australiaHealthyShare * 100)}% of series healthy in their latest run.</p> : null}
    </OpsSection>
  </OpsPage>;
}
