"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HorizonSnapshot } from "../../../../backend/src/horizon/types";
import { HORIZON_LEDGER_KEY, emptyHorizonLedger, horizonPredictionMetrics, parseHorizonLedger, recordHorizonPrediction, recordStressCheckpoint, reviewHorizonPredictions, stressCheckpointChanges, type HorizonLedger, type PredictionDirection } from "../../../../backend/src/horizon/ledger";
import { STRESS_STATUS_LABELS, shiftHorizonPeriod, stressSeries, type StressAssessment } from "../../../../backend/src/horizon/stress";

const RESULT_LABELS = { hit: "Decline hit", false_alarm: "False alarm", miss: "Missed decline", correct_clear: "Correct non-decline" };
const percent = (value: number | null) => value === null ? "Not yet scored" : `${(value * 100).toFixed(1)}%`;

function downloadLedger(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `macro-horizon-ledger-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function HorizonLedgerPanel({ snapshot, assessment }: { snapshot: HorizonSnapshot; assessment: StressAssessment }) {
  const [ledger, setLedger] = useState<HorizonLedger | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionDirection>("decline");
  const [clearConfirmed, setClearConfirmed] = useState(false);
  const [writing, setWriting] = useState(false);
  const rawBackup = useRef<string | null>(null);
  useEffect(() => {
    const restore = () => {
      try {
        const saved = localStorage.getItem(HORIZON_LEDGER_KEY);
        rawBackup.current = saved;
        setLedger(saved ? parseHorizonLedger(saved) : emptyHorizonLedger());
        setReadError(null);
      } catch (error) {
        setReadError(error instanceof Error ? error.message : "Local storage is unavailable.");
      } finally { setLoaded(true); }
    };
    const changed = (event: StorageEvent) => { if (event.key === HORIZON_LEDGER_KEY) restore(); };
    restore();
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const metrics = useMemo(() => ledger ? horizonPredictionMetrics(ledger) : null, [ledger]);
  const changes = useMemo(() => ledger ? stressCheckpointChanges(ledger.checkpoints, assessment) : [], [ledger, assessment]);
  const latestCompensation = stressSeries(snapshot, "real_compensation", assessment.evaluatedAt).at(-1);
  const targetPeriod = latestCompensation ? shiftHorizonPeriod(latestCompensation.period, "quarterly", 4) : null;
  const commit = (next: HorizonLedger, expected: string | null) => {
    const serialized = JSON.stringify(next);
    parseHorizonLedger(serialized);
    if (localStorage.getItem(HORIZON_LEDGER_KEY) !== expected) throw new Error("The ledger changed in another tab. Reload this page before saving; no records were overwritten.");
    localStorage.setItem(HORIZON_LEDGER_KEY, serialized);
    rawBackup.current = serialized;
    setLedger(next);
  };
  const perform = async (action: (current: HorizonLedger) => { next: HorizonLedger; message: string }) => {
    if (!ledger || readError || writing) return;
    const expected = rawBackup.current;
    setWriting(true);
    setActionError(null);
    setMessage(null);
    try {
      if (!navigator.locks) throw new Error("Safe local ledger writes require browser Web Locks in a secure context. Export remains available; no data was overwritten.");
      await navigator.locks.request(HORIZON_LEDGER_KEY, () => {
        const result = action(ledger);
        commit(result.next, expected);
        setMessage(result.message);
      });
    } catch (error) { setActionError(error instanceof Error ? error.message : "The local ledger could not be saved. Existing entries remain unchanged."); } finally { setWriting(false); }
  };

  return <section className="mt-10 break-words border-t border-[var(--line)] pt-8" aria-label="Prediction ledger">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#8b9dff]">Prospective records · local browser only</p><h3 className="mt-3 text-2xl">Make the call before the outcome.</h3></div><button type="button" disabled={!loaded || !ledger && !rawBackup.current} onClick={() => downloadLedger(ledger ? JSON.stringify(ledger, null, 2) : rawBackup.current!)} className="min-h-10 border border-[var(--line-2)] px-4 text-xs disabled:opacity-40">Export ledger JSON ↓</button></div>
    <p className="mt-4 max-w-4xl text-xs leading-7 text-[var(--ink-2)]">Checkpoints freeze the exact evidence, rule version and settings. Predictions are separate, explicit calls about BLS real hourly compensation one observation-year ahead—not synthetic household outcomes or a crisis forecast. Existing calls are never silently rewritten. This device’s clock and local storage are not a signed, server-verified audit trail; clearing browser data loses the ledger. Export backups.</p>
    {readError && <div className="mt-5 border border-amber-300/30 p-4 text-xs leading-6 text-amber-200" role="alert">The saved ledger could not be verified: {readError} Saving is disabled; existing storage has not been overwritten. Export the raw backup if available before explicitly clearing it.</div>}
    {actionError && <p className="mt-4 text-xs leading-6 text-amber-200" role="alert">{actionError}</p>}
    {message && <p className="mt-4 text-xs leading-6 text-[#8b9dff]" role="status">{message}</p>}
    {changes.filter(change => change.kind === "retracted").map(change => <p key={change.id} className="mt-4 border border-[#8b9dff]/30 p-4 text-xs leading-6" role="status">Rule retraction: {change.title} no longer meets the saved proxy-watch rule on verified evidence. Save a checkpoint to retain this change. This is not a confirmed broad recovery.</p>)}
    {changes.some(change => change.kind === "settings_changed") && <p className="mt-4 text-xs leading-6 text-[var(--ink-2)]">Rule settings differ from the last verified checkpoint. Changed classifications are not automatically treated as evidence-driven retractions.</p>}

    <div className="mt-6 grid gap-4 lg:grid-cols-2"><article className="border border-[var(--line)] p-5"><h4 className="text-base">Freeze this watchlist</h4><p className="mt-2 text-xs leading-6 text-[var(--ink-2)]">Capture current or unverified states without turning them into a forecast. Source histories are frozen as retrieved; a later source revision can change the next checkpoint.</p><button type="button" disabled={!ledger || !!readError} onClick={() => perform(current => {
      const next = recordStressCheckpoint(current, snapshot, assessment.settings, new Date().toISOString(), crypto.randomUUID());
      return { next, message: next === current ? "No new checkpoint: evidence, settings and classifications are unchanged." : "Evidence checkpoint saved locally." };
    })} className="mt-4 min-h-10 border border-[var(--line-2)] px-4 text-xs disabled:opacity-40">Save watch checkpoint</button></article><article className="border border-[var(--line)] p-5"><h4 className="text-base">Register a testable prediction</h4><p className="mt-2 text-xs leading-6 text-[var(--ink-2)]">Target {targetPeriod ?? "unavailable"}: real hourly compensation’s exact year-on-year change will be below zero, or at least zero. Anchor {latestCompensation?.period ?? "unavailable"}. One original call per target quarter prevents duplicate scoring.</p><label className="mt-4 block text-xs text-[var(--ink-2)]">My prediction<select aria-label="Prediction direction" value={prediction} onChange={event => setPrediction(event.target.value as PredictionDirection)} className="mt-2 block min-h-10 w-full border border-[var(--line-2)] bg-[var(--depth-1)] px-3 text-[var(--ink)]"><option value="decline">Below zero · real compensation declines</option><option value="not_decline">At least zero · no real compensation decline</option></select></label><button type="button" disabled={!ledger || !!readError || !targetPeriod || writing} onClick={() => perform(current => ({ next: recordHorizonPrediction(current, snapshot, assessment.settings, prediction, new Date().toISOString(), crypto.randomUUID()), message: "Prediction registered before its target period, with frozen evidence and a persistence benchmark." }))} className="mt-4 min-h-10 border border-[var(--line-2)] px-4 text-xs disabled:opacity-40">Register prediction</button></article></div>

    <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><h4 className="text-lg">Prediction scorecard</h4><button type="button" disabled={!ledger?.predictions.length || !!readError || writing} onClick={() => perform(current => {
      const result = reviewHorizonPredictions(current, snapshot, new Date().toISOString());
      return { next: result.ledger, message: `${result.added} new outcomes · ${result.revised} evidence revisions · ${result.pending} awaiting target observations · ${result.unverified} cannot verify. Unchanged outcomes are not appended twice.` };
    })} className="min-h-10 px-3 text-xs underline disabled:opacity-40">Review saved predictions</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Registered / scored", metrics ? `${metrics.registered} / ${metrics.scored}` : "Loading…"],
      ["Prediction accuracy", percent(metrics?.accuracy ?? null)],
      ["Persistence benchmark", percent(metrics?.persistenceAccuracy ?? null)],
      ["Mean calendar lead", metrics?.meanCalendarLeadDays == null ? "Not yet scored" : `${metrics.meanCalendarLeadDays.toFixed(0)} days`],
    ].map(([label, value]) => <div key={label} className="border border-[var(--line)] p-4"><p className="text-[10px] text-[var(--ink-2)]">{label}</p><p className="mt-3 font-mono text-base tabular-nums">{value}</p></div>)}</div>
    <p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">This scorecard evaluates explicit compensation calls, not calibration of the proxy watchlist or twenty-year scenarios. A small local sample cannot establish forecasting skill.</p>
    <p className="mt-3 text-xs leading-6 text-[var(--ink-2)]">{metrics ? `${metrics.counts.hit} decline hits · ${metrics.counts.false_alarm} false alarms · ${metrics.counts.miss} missed declines · ${metrics.counts.correct_clear} correct non-declines · ${metrics.pending} pending.` : "Loading local records…"} Accuracy uses only scored targets, once each, using their latest saved review. Persistence predicts the anchor’s decline/non-decline state. Lead is time to target-quarter end, not warning lead to a crisis. No outcome data means no accuracy claim.</p>
    {ledger?.predictions.length === 0 && <p className="mt-4 text-xs text-[var(--ink-2)]">No predictions registered yet.</p>}
    <div className="mt-4 space-y-3">{[...(ledger?.predictions ?? [])].reverse().map(entry => {
      const last = entry.reviews.at(-1);
      return <details key={entry.id} className="border border-[var(--line)] p-4 text-xs leading-6"><summary className="cursor-pointer">{entry.targetPeriod} · {entry.prediction === "decline" ? "Below zero" : "At least zero"} · {last ? RESULT_LABELS[last.result] : "Pending target data"}</summary><p className="mt-3 text-[var(--ink-2)]">Registered {entry.createdAt}. Anchor {entry.anchorPeriod}: {entry.anchorAnnualChange.toFixed(2)}% annual change. Persistence call: {entry.persistencePrediction === "decline" ? "below zero" : "at least zero"}. Evidence checkpoint: {entry.checkpointId}.</p>{entry.reviews.map((review, index) => <p key={index} className="mt-3 border-t border-[var(--line)] pt-3 text-[var(--ink-2)]">Review {index + 1}: {review.reviewedAt} · {RESULT_LABELS[review.result]} · target {review.targetValue}, prior-year {review.comparisonValue}, annual change {review.annualChange.toFixed(3)}%. Source verified {review.sourceVerifiedAt}. {review.targetSourceStatus ?? "No target source footnote"}. Earlier reviews remain preserved when revised data changes the result.</p>)}</details>;
    })}</div>

    <details className="mt-6 border border-[var(--line)] p-5 text-xs leading-6 text-[var(--ink-2)]"><summary className="cursor-pointer text-sm text-[var(--ink)]">Evidence checkpoint history · {ledger?.checkpoints.length ?? 0} saved</summary>{ledger?.checkpoints.length === 0 && <p className="mt-3">No checkpoints saved yet.</p>}{(ledger?.checkpoints ?? []).map((checkpoint, index) => {
      const transitions = stressCheckpointChanges(ledger!.checkpoints.slice(0, index), checkpoint.assessment);
      return <article key={checkpoint.id} className="mt-4 border-t border-[var(--line)] pt-4"><p className="font-mono text-[10px] text-[var(--ink)]">{checkpoint.createdAt} · {checkpoint.id}</p><p className="mt-2">{checkpoint.assessment.watches.filter(watch => watch.evidence.length > 0).map(watch => `${watch.title}: ${STRESS_STATUS_LABELS[watch.status]}`).join(" · ")}</p>{transitions.filter(change => change.kind !== "unchanged").map(change => <p key={change.id} className="mt-1">{change.title}: {change.kind === "retracted" ? "Saved watch retracted" : change.kind === "settings_changed" ? "Rule settings changed" : change.kind === "unverified" ? "Cannot verify; not recovery" : "Classification changed"}.</p>)}</article>;
    })}</details>
    <details className="mt-4 border border-[var(--line)] p-5 text-xs leading-6 text-[var(--ink-2)]"><summary className="cursor-pointer">Local storage and reset</summary><p className="mt-3">This origin keeps at most 30 checkpoints, 20 predictions, 20 reviews per prediction and 3 MB. Writes use browser Web Locks and reject stale-tab updates. Storage errors do not silently clear or overwrite records. Data is not synced across devices or shared with the server. This version exports backups but has no import UI. A reset also resets this device’s scorecard.</p><label className="mt-4 flex items-start gap-3"><input type="checkbox" checked={clearConfirmed} onChange={event => setClearConfirmed(event.target.checked)} className="mt-1 accent-[#8b9dff]" /><span>I have exported any needed backup and want to clear this local ledger.</span></label><button type="button" disabled={!loaded || !clearConfirmed || writing} onClick={async () => {
      const expected = rawBackup.current;
      setWriting(true);
      try {
        if (!navigator.locks) throw new Error("Safe reset requires browser Web Locks; no successful reset is claimed.");
        await navigator.locks.request(HORIZON_LEDGER_KEY, () => commit(emptyHorizonLedger(), expected));
        setReadError(null); setActionError(null); setClearConfirmed(false); setMessage("Local ledger explicitly cleared. Other module data is unchanged.");
      } catch (error) { setActionError(error instanceof Error ? error.message : "Local storage could not be cleared. No successful reset is claimed."); } finally { setWriting(false); }
    }} className="mt-4 min-h-10 border border-amber-300/30 px-4 text-xs text-amber-200 disabled:opacity-40">Clear local ledger</button></details>
  </section>;
}
