/* ────────────────────────────────────────────────────────────────
   Public track record (roadmap #11): log each open-data signal the
   day it changes state (migration 032_signal_log.sql). Scoring at
   1/3/6 months comes later and only adds to `outcomes`.

   Signals logged today (open data only, per #18):
     au-pulse           Australia Pulse quadrant: growth/inflation
                        direction of the leading-indicator diffusion
     us-macro-quadrant  US economic regime from FRED growth/inflation
     macro-weather      the newsletter's macro weather read
──────────────────────────────────────────────────────────────── */
import { computePulse, type Pulse } from "../australia/pulse";
import { computeMacroWeather } from "../macro/weather";
import type { Queryable } from "../storage/db";
import { getAustraliaObservations } from "../storage/australiaWatchRepo";
import { getLatestMacroSnapshot, type MacroSnapshotRow } from "../storage/macroRepo";

type PulseSchedules = NonNullable<NonNullable<Parameters<typeof computePulse>[1]>["schedules"]>;

export interface SignalReading {
  signal: string;
  state: string;
  label: string;
  detail: Record<string, unknown>;
}

export interface LoggedSignal { id: number; signal: string; firedOn: string; state: string; previousState: string | null }

export type LogAction =
  | { kind: "none" }
  | { kind: "insert"; previousState: string | null }
  /** The state changed again on the day a row was already written: keep the day's last state. */
  | { kind: "update"; id: number }
  /** It changed back on the same day: the change never really happened. */
  | { kind: "delete"; id: number };

/**
 * What to do with a new reading, given the latest logged row for that signal.
 * Rows are only written on a change of state; a same-day rewrite keeps one row per day.
 */
export function decideLog(reading: SignalReading, latest: LoggedSignal | null, today: string): LogAction {
  if (!latest) return { kind: "insert", previousState: null };
  if (latest.state === reading.state) return { kind: "none" };
  if (latest.firedOn !== today) return { kind: "insert", previousState: latest.state };
  if (latest.previousState !== null && latest.previousState === reading.state) return { kind: "delete", id: latest.id };
  return { kind: "update", id: latest.id };
}

/** Australia Pulse reading, or null while either axis lacks enough current series. */
export function pulseReading(pulse: Pulse): SignalReading | null {
  const { growth, inflation, label } = pulse.quadrant;
  if (growth === null || inflation === null) return null;
  return {
    signal: "au-pulse",
    state: `${growth}/${inflation}`,
    label,
    detail: {
      engineVersion: pulse.engineVersion,
      growthShare: pulse.growth.share, growthUp: pulse.growth.up, growthDown: pulse.growth.down,
      inflationShare: pulse.inflation.share, inflationUp: pulse.inflation.up, inflationDown: pulse.inflation.down,
      coverage: pulse.coverage.withData, of: pulse.coverage.primary,
    },
  };
}

/** US regime and macro weather readings from the latest macro snapshot. */
export function macroReadings(snap: MacroSnapshotRow): SignalReading[] {
  const out: SignalReading[] = [];
  if (snap.quadrant && snap.quadrant !== "PENDING") {
    out.push({
      signal: "us-macro-quadrant", state: snap.quadrant, label: snap.regimeHeadline || snap.quadrant,
      detail: { runDate: snap.runDate, growthYoy: snap.growthYoy, growthMomentum: snap.growthMomentum,
        inflationYoy: snap.inflationYoy, inflationMomentum: snap.inflationMomentum, coverage: snap.regimeCoverage },
    });
  }
  const weather = computeMacroWeather({
    economicRegime: snap.quadrant, marketRegime: snap.marketRegime, riskOnShare: snap.marketRiskOn,
    liquidityScore: snap.liquidityScore, liquidityLegs: snap.liquidityLegs,
  });
  if (weather.reading !== "PENDING") {
    out.push({
      signal: "macro-weather", state: weather.stormWatch ? `${weather.reading}+WATCH` : weather.reading,
      label: weather.label + (weather.stormWatch ? " (storm watch)" : ""),
      detail: { runDate: snap.runDate, agree: weather.agree, reasons: weather.reasons, stretchedLegs: weather.stretchedLegs,
        economicRegime: snap.quadrant, marketRegime: snap.marketRegime, liquidityScore: snap.liquidityScore },
    });
  }
  return out;
}

async function latestLogged(db: Queryable, signal: string): Promise<LoggedSignal | null> {
  const res = await db.query(
    `select id, signal, fired_on, state, previous_state from signal_log where signal = $1 order by fired_on desc limit 1`, [signal]);
  const r = res.rows[0];
  if (!r) return null;
  const firedOn = r.fired_on instanceof Date ? r.fired_on.toISOString().slice(0, 10) : String(r.fired_on).slice(0, 10);
  return { id: Number(r.id), signal: String(r.signal), firedOn, state: String(r.state), previousState: r.previous_state == null ? null : String(r.previous_state) };
}

/** Applies one reading. Returns what was done, for the cron report. */
export async function logSignal(db: Queryable, reading: SignalReading, today: string): Promise<LogAction["kind"]> {
  const action = decideLog(reading, await latestLogged(db, reading.signal), today);
  if (action.kind === "insert") {
    await db.query(
      `insert into signal_log (signal, fired_on, state, previous_state, label, detail) values ($1, $2, $3, $4, $5, $6)
       on conflict (signal, fired_on) do nothing`,
      [reading.signal, today, reading.state, action.previousState, reading.label, JSON.stringify(reading.detail)]);
  } else if (action.kind === "update") {
    await db.query(`update signal_log set state = $2, label = $3, detail = $4, logged_at = now() where id = $1`,
      [action.id, reading.state, reading.label, JSON.stringify(reading.detail)]);
  } else if (action.kind === "delete") {
    await db.query(`delete from signal_log where id = $1`, [action.id]);
  }
  return action.kind;
}

export interface SignalLogResult { signal: string; ok: boolean; action?: LogAction["kind"]; state?: string; error?: string; skipped?: string }

/**
 * Reads the current open-data signals and logs any change. Each signal is
 * isolated: one failing never stops the others. Never throws.
 * `schedules` are the ABS release calendars (as the Australia Watch page uses);
 * without them the Pulse falls back to estimated release lags.
 */
export async function logOpenDataSignals(
  db: Queryable,
  opts: { now?: Date; schedules?: PulseSchedules } = {},
): Promise<SignalLogResult[]> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const results: SignalLogResult[] = [];
  const apply = async (reading: SignalReading) => {
    try {
      results.push({ signal: reading.signal, ok: true, state: reading.state, action: await logSignal(db, reading, today) });
    } catch (e) {
      results.push({ signal: reading.signal, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  try {
    const pulse = computePulse(await getAustraliaObservations(db), { now, schedules: opts.schedules, leads: false });
    const reading = pulseReading(pulse);
    if (reading) await apply(reading);
    else results.push({ signal: "au-pulse", ok: true, skipped: "not enough current readings" });
  } catch (e) {
    results.push({ signal: "au-pulse", ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  try {
    const snap = await getLatestMacroSnapshot(db);
    if (!snap) results.push({ signal: "us-macro-quadrant", ok: true, skipped: "no macro snapshot yet" });
    else for (const r of macroReadings(snap)) await apply(r);
  } catch (e) {
    results.push({ signal: "us-macro-quadrant", ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  return results;
}
