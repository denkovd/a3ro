/* ────────────────────────────────────────────────────────────────
   Ingestion cycle — the one function a cron entrypoint calls.

   poll (gated) → store observations → resolve → evaluate alerts

   Wiring this to an actual scheduler is deferred work:
   - Vercel: an app/api/cron route calling runIngestionCycle(), pinned
     to the Node runtime (`export const runtime = "nodejs"` — pg needs
     TCP, Edge can't). Schedule DAILY on Hobby (plan hard-limit: more
     frequent crons fail at deploy time); 10–15 min is the Pro-tier
     schedule once an intraday source (yfinance / paid feed) exists.
   - Standalone: setInterval or systemd timer around the same call.
   The cycle is idempotent either way — running it more often than
   sources publish is safe, just pointless.
──────────────────────────────────────────────────────────────── */

import { Benchmark, BENCHMARKS, SourceError } from "../core/types";
import { OilPriceSource } from "../sources/OilPriceSource";
import { buildSources } from "../sources/registry";
import { Queryable } from "../storage/db";
import {
  getDailySeries,
  getEnabledSourceIds,
  getIntradayObservations,
  getLatestDailyPrice,
  getNewestObservations,
  getObservationsForPeriod,
  insertObservations,
  upsertDailyPrice,
  upsertLatestQuote,
} from "../storage/priceRepo";
import { getAlertState, getEnabledRules, insertAlertEvent, saveAlertState } from "../storage/alertRepo";
import { checkGate, noteFailure, noteSuccess, withRetry } from "./rateGate";
import { DescriptorLookup, resolveDailyClose, resolveLatestQuote } from "./resolve";
import { evaluateRule } from "../alerts/rules";
import { classifyStaleness, isAlertGrade } from "../core/time";

export interface CycleReport {
  startedAt: string;
  polled: { sourceId: string; ok: boolean; records: number; skipped?: string; error?: string }[];
  resolved: { benchmark: Benchmark; quote: boolean; dailyUpserts: number }[];
  alertsFired: string[];
}

export interface CycleOptions {
  benchmarks?: Benchmark[];
  sources?: OilPriceSource[]; // injectable for tests
  now?: () => Date;
}

export async function runIngestionCycle(
  db: Queryable,
  opts: CycleOptions = {},
): Promise<CycleReport> {
  const benchmarks = opts.benchmarks ?? [...BENCHMARKS];
  const allSources = (opts.sources ?? buildSources());
  const enabledIds = await getEnabledSourceIds(db);
  const sources = allSources.filter((s) => enabledIds.has(s.descriptor.id));
  const now = opts.now ?? (() => new Date());

  const report: CycleReport = {
    startedAt: now().toISOString(),
    polled: [],
    resolved: [],
    alertsFired: [],
  };

  const lookup: DescriptorLookup = (id) => {
    const s = allSources.find((x) => x.descriptor.id === id);
    // Unknown source (e.g. adapter removed but history remains):
    // deprioritize hard, treat as slow daily publisher.
    return s
      ? s.descriptor
      : { priority: 99, expectedCadenceMs: 86_400_000, publicationLagBusinessDays: 4 };
  };

  /* 1 ── poll backbone + supplement every cycle; reserve only on demand */
  const eager = sources.filter((s) => s.descriptor.role !== "reserve");
  await pollSources(db, eager, benchmarks, report);

  /* 2 ── check whether any benchmark still lacks alert-grade data */
  const needy: Benchmark[] = [];
  for (const b of benchmarks) {
    const obs = await getNewestObservations(db, b);
    const ok = obs.some((r) => isAlertGrade(classifyStaleness(r, lookup(r.source), now())));
    if (!ok) needy.push(b);
  }
  if (needy.length > 0) {
    const reserve = sources.filter(
      (s) => s.descriptor.role === "reserve" &&
        s.descriptor.benchmarks.some((b) => needy.includes(b)),
    );
    await pollSources(db, reserve, needy, report);
  }

  /* 3 ── resolve per benchmark */
  for (const b of benchmarks) {
    const obs = await getNewestObservations(db, b);

    // 3a. daily closes: (re-)resolve every period seen among newest settlement obs
    const periods = [...new Set(
      obs.filter((r) => r.periodDate).map((r) => r.periodDate as string),
    )];
    let dailyUpserts = 0;
    for (const period of periods) {
      const periodObs = await getObservationsForPeriod(db, b, period);
      const daily = resolveDailyClose(b, period, periodObs, lookup);
      if (daily) {
        await upsertDailyPrice(db, daily);
        dailyUpserts++;
      }
    }

    // 3b. ticker quote, sanity-checked against the latest resolved close.
    // Classify that close's own freshness so a live quote is only flagged
    // "suspect" against a CURRENT settlement — a lagging Brent close would
    // otherwise trip the 10% check on a legitimate multi-day price move.
    const refClose = await getLatestDailyPrice(db, b);
    const refStaleness = refClose
      ? classifyStaleness(
          {
            kind: "settlement",
            observedAt: `${refClose.periodDate}T00:00:00Z`,
            periodDate: refClose.periodDate,
          },
          lookup(refClose.source),
          now(),
        )
      : undefined;
    const quote = resolveLatestQuote(b, obs, lookup, refClose?.price ?? null, now(), refStaleness);
    if (quote) await upsertLatestQuote(db, quote);

    report.resolved.push({ benchmark: b, quote: quote !== null, dailyUpserts });

    /* 4 ── alerts for this benchmark */
    const rules = (await getEnabledRules(db)).filter((r) => r.benchmark === b);
    if (rules.length > 0) {
      const from = new Date(now().getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
      const to = now().toISOString().slice(0, 10);
      const ctx = {
        quote,
        dailySeries: await getDailySeries(db, b, from, to),
        intradaySeries: await getIntradayObservations(db, b, 24),
        now: now(),
      };
      for (const rule of rules) {
        const state = await getAlertState(db, rule.id);
        const result = evaluateRule(rule, state, ctx);
        const fired = result.event !== undefined;
        if (result.event) {
          await insertAlertEvent(db, result.event.ruleId, result.event.payload);
          report.alertsFired.push(rule.id);
        }
        await saveAlertState(
          db,
          rule.id,
          { status: result.nextStatus, lastValue: result.lastValue ?? state.lastValue },
          fired,
        );
      }
    }
  }

  return report;
}

/* ── polling helper ───────────────────────────────────────────── */

async function pollSources(
  db: Queryable,
  sources: OilPriceSource[],
  benchmarks: Benchmark[],
  report: CycleReport,
): Promise<void> {
  await Promise.all(
    sources.map(async (source) => {
      const d = source.descriptor;
      const wanted = benchmarks.filter((b) => d.benchmarks.includes(b));
      if (wanted.length === 0) return;

      const gate = await checkGate(db, d);
      if (!gate.allowed) {
        report.polled.push({
          sourceId: d.id, ok: false, records: 0,
          skipped: `${gate.reason}${gate.until ? ` until ${gate.until}` : ""}`,
        });
        return;
      }

      try {
        const records = await withRetry(() => source.fetchLatest(wanted), d.id);
        const written = await insertObservations(db, records);
        await noteSuccess(db, d);
        report.polled.push({ sourceId: d.id, ok: true, records: written });
      } catch (e) {
        if (e instanceof SourceError) {
          await noteFailure(db, d, e);
          report.polled.push({ sourceId: d.id, ok: false, records: 0, error: `${e.kind}: ${e.message}` });
        } else {
          // Unknown throw = adapter bug. Count it against the breaker like a bad payload.
          const err = new SourceError(d.id, "bad_payload", String(e), { cause: e });
          await noteFailure(db, d, err);
          report.polled.push({ sourceId: d.id, ok: false, records: 0, error: err.message });
        }
      }
    }),
  );
}
