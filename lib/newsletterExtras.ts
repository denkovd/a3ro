// Inputs for the weekly newsletter that live outside the database (roadmap #36 v2): COMEX copper
// stocks, ABS monthly exports for iron ore, copper and LNG, and the ABS/RBA release calendars.
// Each reader is isolated: a failure leaves that part out of the commodity brief or the calendar.
import type { CopperStocksRead, ExportRead, IssueExtras, ScheduleEntry } from "@a3ro/oil-backend";
import { AUSTRALIA_REGISTRY } from "../backend/src/australia/registry";
import { fetchAustraliaReleaseSchedules } from "../backend/src/sources/absReleases";
import { fetchCommodityExports, type AbsExportSpec } from "./commodity/absExports";
import { COPPER_EXPORTS } from "./copper/reference";
import { fetchComexCopperStocks } from "./copper/comexStocks";
import { IRON_ORE_EXPORTS } from "./ironore/reference";
import { LNG_EXPORTS } from "./lng/reference";

const EXPORTS: { spec: AbsExportSpec; label: string }[] = [
  { spec: IRON_ORE_EXPORTS, label: "Iron ore" },
  { spec: COPPER_EXPORTS, label: "Copper" },
  { spec: LNG_EXPORTS, label: "LNG" },
];

async function exportRead(spec: AbsExportSpec, label: string): Promise<ExportRead | null> {
  const e = await fetchCommodityExports(spec);
  const last = e.months[e.months.length - 1], prev = e.months[e.months.length - 2];
  return last ? { id: spec.id, label, latestPeriod: last.period, latestAudM: last.totalAudM, prevAudM: prev?.totalAudM ?? null } : null;
}

export async function newsletterExtras(): Promise<IssueExtras> {
  const [copper, exportsRead, schedules] = await Promise.all([
    fetchComexCopperStocks().then((c): CopperStocksRead => ({ reportDate: c.reportDate, total: c.total, prevTotal: c.prevTotal })).catch(() => null),
    Promise.all(EXPORTS.map((x) => exportRead(x.spec, x.label).catch(() => null))),
    fetchAustraliaReleaseSchedules().catch(() => null),
  ]);
  const entries: ScheduleEntry[] = schedules
    ? Object.entries(schedules).map(([indicator, schedule]) => ({
      indicator, schedule,
      family: (AUSTRALIA_REGISTRY as Record<string, { releaseFamily?: string }>)[indicator]?.releaseFamily ?? indicator,
    }))
    : [];
  return { copperStocks: copper, exports: exportsRead.filter((e): e is ExportRead => e !== null), schedules: entries };
}

export const ownerEmails = (): string[] => (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
