// Controls (roadmap #52): module access without a redeploy, fit ratings for the scorecard, and
// manual cron re-runs. The review queue for local-model drafts waits until that pipeline exists.
import { createDb, getModuleSettings } from "@a3ro/oil-backend";
import { MODULE_ACCESS } from "../../../lib/access";
import { CRON_JOBS } from "../../../lib/crons";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection } from "../ui";
import { CronControls, ModuleControls, type ControlRow } from "./Controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  await requireOwner();
  let settings: Awaited<ReturnType<typeof getModuleSettings>> | null = null;
  try { settings = await getModuleSettings(await createDb()); } catch { settings = null; }
  const rows: ControlRow[] = MODULE_ACCESS.filter((m) => !m.hidden).map((m) => {
    const s = settings?.find((x) => x.moduleId === m.id);
    return { id: m.id, label: m.label, data: m.data, defaultLevel: m.level, level: s?.level ?? null, fitRating: s?.fitRating ?? null };
  });

  return <OpsPage title="Controls">
    <OpsSection title="Module access and fit" note="Access changes apply to pages and APIs within 30 seconds, no redeploy. Market-data modules can't be made public until the data is licensed. Fit (1–5) feeds the scorecard.">
      {settings === null
        ? <p className="text-xs text-[var(--ink-2)]">Settings table not found. Run <code>npm --prefix backend run migrate:module-settings</code>.</p>
        : <ModuleControls rows={rows} />}
    </OpsSection>
    <OpsSection title="Re-run a cron job" note="Runs the job now, as the daily schedule would. Some take a few minutes; wait for the result.">
      <CronControls jobs={CRON_JOBS} />
    </OpsSection>
    <OpsSection title="Review queue">
      <p className="text-xs text-[var(--ink-3)]">For approving drafts from the local model before they publish. Nothing generates drafts yet, so there&rsquo;s nothing to review.</p>
    </OpsSection>
  </OpsPage>;
}
