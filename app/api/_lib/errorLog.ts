/* ────────────────────────────────────────────────────────────────
   Route error log (roadmap #48).

   withErrorLog wraps a route handler: a thrown error or any 5xx
   response is written to the app_errors table (grouped by message,
   with first/last seen and a count). Logging is best-effort and can
   never change the response or throw: if the database is down or the
   table is missing, the route behaves exactly as before.
──────────────────────────────────────────────────────────────── */

const LOG_TIMEOUT_MS = 2_000;

/** Records one error. Never throws; gives up after 2s so a slow DB can't hold a response. */
export async function logAppError(source: string, message: string, status?: number | null): Promise<void> {
  try {
    const write = (async () => {
      // Loaded lazily so a broken backend import can't break the route that is reporting the error.
      const backend = await import("@a3ro/oil-backend");
      if (typeof backend.recordAppError !== "function" || typeof backend.createDb !== "function") return;
      await backend.recordAppError(await backend.createDb(), { source, message, status });
    })();
    await Promise.race([write, new Promise<void>((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS))]);
    write.catch(() => {});
  } catch {
    // Best-effort only.
  }
}

async function describeFailedResponse(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    const detail = typeof body.error === "string" ? body.error
      : typeof body.summary === "string" ? body.summary
      : typeof body.status === "string" ? body.status
      : null;
    if (detail) return `HTTP ${response.status}: ${detail}`;
  } catch {
    // Not JSON; fall through.
  }
  return `HTTP ${response.status}`;
}

/** Statuses that mean the job never ran (bad cron secret, retired route), so they aren't logged as runs. */
const NOT_A_RUN = new Set([401, 403, 404, 405, 410]);

/**
 * Records one cron run in cron_runs (roadmap #47). Same best-effort rules as logAppError:
 * never throws, gives up after 2s, and a missing table or broken import changes nothing.
 */
async function logCronRun(job: string, startedAt: Date, httpStatus: number, response: Response | null, thrown?: unknown): Promise<void> {
  if (NOT_A_RUN.has(httpStatus)) return;
  const durationMs = Date.now() - startedAt.getTime();
  try {
    const write = (async () => {
      let body: unknown = null;
      if (response) { try { body = await response.clone().json(); } catch { body = null; } }
      const backend = await import("@a3ro/oil-backend");
      if (typeof backend.recordCronRun !== "function" || typeof backend.summarizeCronReport !== "function") return;
      const summary = backend.summarizeCronReport(body, httpStatus);
      if (thrown !== undefined && !summary.error) summary.error = backend.redactErrorMessage(thrown instanceof Error ? thrown.message : String(thrown));
      await backend.recordCronRun(await backend.createDb(), { job, startedAt: startedAt.toISOString(), durationMs, httpStatus, ...summary });
    })();
    await Promise.race([write, new Promise<void>((resolve) => setTimeout(resolve, LOG_TIMEOUT_MS))]);
    write.catch(() => {});
  } catch {
    // Best-effort only.
  }
}

export function withErrorLog<A extends unknown[]>(source: string, handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  const cronJob = source.startsWith("cron:") ? source.slice("cron:".length) : null;
  return async (...args: A) => {
    const startedAt = new Date();
    let response: Response;
    try {
      response = await handler(...args);
    } catch (error) {
      await logAppError(source, error instanceof Error ? error.message : String(error), 500);
      if (cronJob) await logCronRun(cronJob, startedAt, 500, null, error);
      throw error;
    }
    if (response.status >= 500) await logAppError(source, await describeFailedResponse(response), response.status);
    if (cronJob) await logCronRun(cronJob, startedAt, response.status, response);
    return response;
  };
}
