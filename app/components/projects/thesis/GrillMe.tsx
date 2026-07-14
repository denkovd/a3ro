"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 stage 2 — Grill Me (view component).
   One question at a time, hardest first: answer it or concede it.
   Each answer is graded on the spot with its receipts visible; the
   loop ends in a Decision Memo — PROCEED / PROCEED REDUCED / STAND
   DOWN with the rules that fired listed — copyable and downloadable
   as markdown. Session state lives in the Thesis Lab shell so tab
   switches don't lose the interrogation.
──────────────────────────────────────────────────────────────── */
import { useCallback, useState } from "react";
import {
  LAB_ACCENT,
  LAB_AMBER,
  LAB_MINT,
  LAB_PINK,
  fragilityColor,
  verdictColor,
  type LabResult,
} from "./thesisData";
import {
  buildDecisionMemo,
  buildGrillQuestions,
  callColorKey,
  gradeAnswer,
  memoMarkdown,
  GRILL_KIND_LABEL,
  SKIPPED_GRADE,
  type DecisionMemo,
  type GrillSessionState,
} from "./grill";

const CALL_COLOR = { mint: LAB_MINT, amber: LAB_AMBER, pink: LAB_PINK } as const;

const gradeColor = (label: string): string =>
  label === "Defended" ? LAB_MINT : label === "Partial" ? LAB_AMBER : LAB_PINK;

export default function GrillMe({
  result,
  session,
  onSession,
  onBack,
}: {
  result: LabResult | null;
  session: GrillSessionState | null;
  onSession: (s: GrillSessionState | null) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");

  const start = useCallback(() => {
    if (!result) return;
    onSession({ questions: buildGrillQuestions(result), answers: [], index: 0, phase: "asking" });
    setDraft("");
  }, [result, onSession]);

  const submit = useCallback(
    (skip: boolean) => {
      if (!session || session.phase !== "asking") return;
      const q = session.questions[session.index];
      const answer = skip
        ? { questionId: q.id, text: "", skipped: true, grade: SKIPPED_GRADE }
        : { questionId: q.id, text: draft.trim(), skipped: false, grade: gradeAnswer(q, draft) };
      onSession({ ...session, answers: [...session.answers, answer], phase: "graded" });
    },
    [session, draft, onSession],
  );

  const next = useCallback(() => {
    if (!session || session.phase !== "graded") return;
    const last = session.index >= session.questions.length - 1;
    onSession({ ...session, index: last ? session.index : session.index + 1, phase: last ? "memo" : "asking" });
    setDraft("");
  }, [session, onSession]);

  if (!result) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-[5px] border border-dashed border-[var(--line)] p-8">
        <div className="max-w-md text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Nothing to grill</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-3)]">
            Run a pressure test first — the interrogation is built from the analyzed thesis: its weakest legs,
            its tape contradictions, its unstated assumptions.
          </p>
          <button
            onClick={onBack}
            className="sweep mt-4 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: LAB_ACCENT }}
          >
            ← 01 Pressure Test
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    const a = result.analysis;
    return (
      <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">02 · Grill me</p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
          The engine cross-examines you on <span className="text-[var(--ink)]">{a.direction} {a.instrumentLabel}</span> —
          one question per weak leg, hardest first, then your exit and your size. Answers are graded on the spot
          (evidence, invalidation, engagement with the counter — every point receipted). Skipping a question concedes it.
          The session ends in a decision memo.
        </p>
        <button
          onClick={start}
          className="mt-5 rounded-[4px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]"
          style={{ background: LAB_ACCENT, color: "var(--depth-0)" }}
        >
          Start the grilling
        </button>
      </div>
    );
  }

  if (session.phase === "memo") {
    return <MemoView memo={buildDecisionMemo(result, session)} onRestart={start} />;
  }

  const q = session.questions[session.index];
  const answered = session.phase === "graded" ? session.answers[session.index] : null;

  return (
    <div>
      {/* progress rail */}
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Question {session.index + 1} / {session.questions.length}
        </p>
        <button
          onClick={start}
          className="sweep font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
        >
          Restart
        </button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--depth-3)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${((session.index + (answered ? 1 : 0)) / session.questions.length) * 100}%`, background: LAB_ACCENT }}
        />
      </div>

      {/* question card */}
      <div className="mt-5 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[3px] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
            {GRILL_KIND_LABEL[q.kind]}
          </span>
          {q.critical && (
            <span className="rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ background: `${LAB_PINK}22`, color: LAB_PINK }}>
              Critical
            </span>
          )}
          {q.fragility !== null && (
            <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: fragilityColor(q.fragility) }}>
              Fragility {q.fragility}
            </span>
          )}
        </div>

        {q.assumptionText && (
          <p className="mt-3 border-l-2 pl-3 text-[12px] leading-relaxed text-[var(--ink-3)]" style={{ borderColor: "var(--line-2)" }}>
            {q.assumptionText}
          </p>
        )}
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink)]">{q.prompt}</p>

        {!answered ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Answer it the way you'd answer a risk manager — data, levels, and what proves you wrong."
              rows={5}
              className="mt-4 w-full resize-y rounded-[4px] border border-[var(--line)] bg-[var(--depth-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-[var(--line-2)] focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => submit(true)}
                className="sweep font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)] transition-colors hover:text-[#a8496b]"
              >
                Skip — concede this one
              </button>
              <button
                onClick={() => submit(false)}
                disabled={draft.trim().length < 10}
                className="rounded-[4px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] disabled:cursor-not-allowed"
                style={{
                  background: draft.trim().length >= 10 ? LAB_ACCENT : "var(--depth-3)",
                  color: draft.trim().length >= 10 ? "var(--depth-0)" : "var(--ink-3)",
                }}
              >
                Submit answer
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            {!answered.skipped && <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">{answered.text}</p>}
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums" style={{ color: gradeColor(answered.grade.label) }}>
                {answered.grade.score}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: gradeColor(answered.grade.label) }}>
                {answered.grade.label}
              </span>
            </div>
            <ul className="mt-2 space-y-1 border-l border-[var(--line)] pl-3">
              {answered.grade.receipts.map((r, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-[var(--ink-3)]">{r}</li>
              ))}
            </ul>
            <div className="mt-4 text-right">
              <button
                onClick={next}
                className="rounded-[4px] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em]"
                style={{ background: LAB_ACCENT, color: "var(--depth-0)" }}
              >
                {session.index >= session.questions.length - 1 ? "Decision memo →" : "Next question →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── decision memo view ───────────────────────────────────────── */

function MemoView({ memo, onRestart }: { memo: DecisionMemo; onRestart: () => void }) {
  const [copied, setCopied] = useState(false);
  const color = CALL_COLOR[callColorKey(memo.call)];

  const copy = useCallback(() => {
    navigator.clipboard.writeText(memoMarkdown(memo)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [memo]);

  const download = useCallback(() => {
    const blob = new Blob([memoMarkdown(memo)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `decision-memo-${memo.date}.md`;
    el.click();
    URL.revokeObjectURL(url);
  }, [memo]);

  return (
    <div>
      {/* call banner */}
      <div className="rounded-[5px] border p-5" style={{ borderColor: `${color}55`, background: `${color}0d` }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Decision memo · {memo.date}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color }}>{memo.call}</p>
        <ul className="mt-3 space-y-1">
          {memo.callReceipts.map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              <span aria-hidden className="font-mono text-[10px]" style={{ color }}>▸</span>
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button onClick={copy} className="rounded-[4px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ background: color, color: "var(--depth-0)" }}>
            {copied ? "Copied" : "Copy markdown"}
          </button>
          <button onClick={download} className="sweep font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]">
            Download .md
          </button>
          <button onClick={onRestart} className="sweep ml-auto font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]">
            Grill again
          </button>
        </div>
      </div>

      {/* thesis line */}
      <div className="mt-5 rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">Thesis under test</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[14px] font-medium text-[var(--ink)]">{memo.thesisLine}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: verdictColor(memo.verdict) }}>
            {memo.strength}/100 · {memo.verdict}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">{memo.headline}</p>
      </div>

      {/* grilling record */}
      <div className="mt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Grilling record — answer average {memo.avgScore}/100 · {memo.dodgedCritical} critical dodged
        </p>
        <div className="mt-3 space-y-2">
          {memo.record.map(({ question, answer }, i) => (
            <div key={question.id} className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="rounded-[3px] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
                  {GRILL_KIND_LABEL[question.kind]}
                </span>
                {question.critical && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: LAB_PINK }}>critical</span>
                )}
                <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: gradeColor(answer?.grade.label ?? "Dodged") }}>
                  {answer && !answer.skipped ? `${answer.grade.label} · ${answer.grade.score}` : "Conceded"}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">{question.prompt}</p>
              {answer && !answer.skipped && (
                <p className="mt-2 border-l-2 border-[var(--line-2)] pl-3 text-[12px] leading-relaxed text-[var(--ink-2)]">{answer.text}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* kill conditions + open questions */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {memo.killConditions.length > 0 && (
          <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: LAB_AMBER }}>Kill conditions to monitor</p>
            <ul className="mt-2 space-y-1.5">
              {memo.killConditions.map((k, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
                  <span aria-hidden className="font-mono text-[10px]" style={{ color: LAB_AMBER }}>▸</span>
                  {k}
                </li>
              ))}
            </ul>
          </div>
        )}
        {memo.openQuestions.length > 0 && (
          <div className="rounded-[5px] border border-[var(--line)] bg-[var(--depth-1)] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: LAB_PINK }}>Open — dodged or skipped</p>
            <ul className="mt-2 space-y-1.5">
              {memo.openQuestions.map((q, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
                  <span aria-hidden className="font-mono text-[10px]" style={{ color: LAB_PINK }}>▸</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
