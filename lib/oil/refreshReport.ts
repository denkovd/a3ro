type ProviderResult = { sourceId: string; ok: boolean; records: number; skipped?: string };
type CycleReport = { startedAt: string; polled: ProviderResult[] };

/** Logs contain provider outcomes and counts, never credentials or raw errors. */
export function summarizeRefresh(report: CycleReport | null) {
  const providers = (report?.polled ?? []).map(p => ({ sourceId: p.sourceId, ok: p.ok, records: p.records, skipped: Boolean(p.skipped) }));
  const succeeded = providers.filter(p => p.ok).length;
  const failed = providers.filter(p => !p.ok && !p.skipped).length;
  const skipped = providers.filter(p => p.skipped).length;
  const status = !report || failed > 0 && succeeded === 0 ? "failed"
    : failed > 0 ? "degraded" : succeeded > 0 ? "healthy" : "no-op";
  return { status, startedAt: report?.startedAt ?? null, succeeded, failed, skipped,
    records: providers.reduce((sum, p) => sum + p.records, 0), providers };
}
