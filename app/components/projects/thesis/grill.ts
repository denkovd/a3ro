"use client";
/* ────────────────────────────────────────────────────────────────
   P·07 stage 2 — Grill Me: deterministic interrogation loop.
   Questions are generated from the analyzed thesis (weakest
   assumptions first; tape contradictions, fake-confidence claims
   and implied legs outrank the rest), answers are graded by a
   visible lexicon scorer — every point carries a receipt — and the
   session closes with a Decision Memo (PROCEED / PROCEED REDUCED /
   STAND DOWN) whose call is a listed rule set, never a vibe.
   Pure functions only; no fetch, no randomness, no LLM.
──────────────────────────────────────────────────────────────── */
import type { LabAssumption, LabResult } from "./thesisData";

/* ── question schema ──────────────────────────────────────────── */

export type GrillKind = "tape" | "evidence" | "implied" | "counter" | "invalidation" | "sizing";

export type GrillQuestion = {
  id: string;
  kind: GrillKind;
  /** The assumption under fire, when the question targets one. */
  assumptionId: string | null;
  assumptionText: string | null;
  fragility: number | null;
  prompt: string;
  /** Critical questions weigh on the final call when dodged. */
  critical: boolean;
};

export type GrillGrade = {
  score: number; // 0–100
  label: "Defended" | "Partial" | "Dodged";
  receipts: string[];
};

export type GrillAnswer = {
  questionId: string;
  text: string; // "" when skipped
  skipped: boolean;
  grade: GrillGrade;
};

export type GrillPhase = "asking" | "graded" | "memo";

export type GrillSessionState = {
  questions: GrillQuestion[];
  answers: GrillAnswer[];
  index: number;
  phase: GrillPhase;
};

export const GRILL_KIND_LABEL: Record<GrillKind, string> = {
  tape: "Tape disagrees",
  evidence: "Show evidence",
  implied: "Unstated leg",
  counter: "Counter-case",
  invalidation: "Invalidation",
  sizing: "Sizing",
};

/* ── question generation — deterministic, hardest first ───────── */

const MAX_ASSUMPTION_QUESTIONS = 6;

function questionForAssumption(a: LabAssumption, seq: number): GrillQuestion {
  const contradiction = a.checks.find((c) => c.verdict === "contradicts");
  const base = {
    id: `q-${seq}-${a.id}`,
    assumptionId: a.id,
    assumptionText: a.text,
    fragility: a.fragility,
    critical: a.fragility >= 70 || a.fakeConfidence || contradiction !== undefined,
  };
  if (contradiction) {
    return {
      ...base,
      kind: "tape",
      prompt: `The ${contradiction.source} read says "${contradiction.marketReads}", but this leg needs ${contradiction.claimExpects}. Why is the market wrong and you right — and what makes that show up within your horizon?`,
    };
  }
  if (a.fakeConfidence) {
    return {
      ...base,
      kind: "evidence",
      prompt: `You state this with certainty (${a.certaintyMarkers.join(", ") || "no hedges"}), but the evidence in the text scores ${a.evidenceScore ?? "—"}/100. What specific data, level or report is this conviction actually standing on?`,
    };
  }
  if (a.origin === "implied") {
    return {
      ...base,
      kind: "implied",
      prompt: `You never wrote this down, but the trade dies without it: "${a.text}". Defend it explicitly — what supports it, and how would you know it stopped being true?`,
    };
  }
  return {
    ...base,
    kind: "counter",
    prompt: `Strongest counter-case on record: "${a.counterCase}" Answer it directly — where exactly is it wrong, and what would concede it?`,
  };
}

export function buildGrillQuestions(result: LabResult): GrillQuestion[] {
  const a = result.analysis;
  const targets = a.assumptions.slice(0, MAX_ASSUMPTION_QUESTIONS); // already weakest-first
  const qs = targets.map((asm, i) => questionForAssumption(asm, i + 1));

  qs.push({
    id: "q-invalidation",
    kind: "invalidation",
    assumptionId: null,
    assumptionText: null,
    fragility: null,
    critical: true,
    prompt: `Name the exact print, level or event that makes you exit ${a.direction} ${a.instrumentLabel} — not "reassess", exit. If you can't name one, say so.`,
  });

  const downside = result.scenarios.scenarios.reduce<{ name: string; pnl: number } | null>((worst, s) => {
    if (s.thesisPnlPct === null) return worst;
    return worst === null || s.thesisPnlPct < worst.pnl ? { name: s.name, pnl: s.thesisPnlPct } : worst;
  }, null);
  qs.push({
    id: "q-sizing",
    kind: "sizing",
    assumptionId: null,
    assumptionText: null,
    fragility: null,
    critical: false,
    prompt: downside
      ? `The downside path ("${downside.name}") marks this thesis at ${downside.pnl.toFixed(1)}% over ${a.horizonDays} days. What size are you running, and why does that size survive that print without forcing you out at the low?`
      : `No downside scenario could be priced. What size are you running, and what loss makes you cut it regardless of the story?`,
  });

  return qs;
}

/* ── answer grading — lexicon scorer with receipts ─────────────── */

const EVIDENCE_WORDS = [
  "data", "report", "eia", "opec", "cot", "cftc", "fed", "cpi", "pmi", "inventor",
  "spread", "curve", "term structure", "backwardation", "contango", "positioning",
  "flow", "earnings", "guidance", "seasonal", "breadth", "volume",
];
const INVALIDATION_WORDS = [
  "exit", "stop", "cut", "flat", "close the", "invalidate", "wrong if", "i'm out",
  "get out", "kill the trade", "abandon",
];
const CONCESSION_WORDS = [
  "fair", "concede", "agree", "valid", "acknowledge", "the risk is", "i'd be wrong",
  "could be wrong", "if i'm wrong",
];
const DISMISSIVE_WORDS = [
  "obviously", "everyone knows", "trust me", "guaranteed", "can't lose", "cannot lose",
  "just will", "noise", "irrelevant", "always works", "never fails",
];

const hits = (text: string, words: string[]): string[] =>
  words.filter((w) => text.includes(w));

export function gradeAnswer(question: GrillQuestion, raw: string): GrillGrade {
  const text = raw.trim().toLowerCase();
  const receipts: string[] = [];
  let score = 20;
  receipts.push("+20 answered (base)");

  if (text.length < 40) {
    receipts.push("−10 under 40 chars — that's a dodge, not an answer");
    score -= 10;
  } else if (text.length >= 120) {
    receipts.push("+10 substantive length");
    score += 10;
  }

  const numbers = raw.match(/\d+(\.\d+)?/g) ?? [];
  if (numbers.length > 0) {
    receipts.push(`+15 names numbers/levels (${numbers.slice(0, 3).join(", ")}${numbers.length > 3 ? ", …" : ""})`);
    score += 15;
  }

  const ev = hits(text, EVIDENCE_WORDS);
  if (ev.length > 0) {
    receipts.push(`+20 cites checkable evidence (${ev.slice(0, 3).join(", ")})`);
    score += 20;
  }

  const inv = hits(text, INVALIDATION_WORDS);
  if (inv.length > 0) {
    receipts.push(`+20 states an invalidation/exit (${inv[0]})`);
    score += 20;
  } else if (question.kind === "invalidation") {
    receipts.push("−15 invalidation question answered without an exit condition");
    score -= 15;
  }

  const con = hits(text, CONCESSION_WORDS);
  if (con.length > 0) {
    receipts.push(`+15 engages the counter instead of waving it off (${con[0]})`);
    score += 15;
  }

  const dis = hits(text, DISMISSIVE_WORDS);
  if (dis.length > 0) {
    receipts.push(`−20 dismissive language (${dis.slice(0, 2).join(", ")}) — conviction is not evidence`);
    score -= 20;
  }

  score = Math.min(100, Math.max(0, score));
  const label: GrillGrade["label"] = score >= 65 ? "Defended" : score >= 40 ? "Partial" : "Dodged";
  return { score, label, receipts };
}

export const SKIPPED_GRADE: GrillGrade = {
  score: 0,
  label: "Dodged",
  receipts: ["0 — question skipped; the memo records it as conceded"],
};

/* ── decision memo ─────────────────────────────────────────────── */

export type MemoCall = "PROCEED" | "PROCEED REDUCED" | "STAND DOWN";

export type DecisionMemo = {
  date: string;
  call: MemoCall;
  callReceipts: string[];
  thesisLine: string;
  strength: number;
  verdict: string;
  headline: string;
  avgScore: number;
  dodgedCritical: number;
  record: { question: GrillQuestion; answer: GrillAnswer }[];
  killConditions: string[];
  openQuestions: string[];
};

export function buildDecisionMemo(result: LabResult, session: GrillSessionState): DecisionMemo {
  const a = result.analysis;
  const record = session.questions.map((q, i) => ({ question: q, answer: session.answers[i] }));
  const graded = record.filter((r) => r.answer && !r.answer.skipped);
  const avgScore = graded.length
    ? Math.round(graded.reduce((s, r) => s + r.answer.grade.score, 0) / graded.length)
    : 0;
  const dodgedCritical = record.filter(
    (r) => r.question.critical && (!r.answer || r.answer.skipped || r.answer.grade.label === "Dodged"),
  ).length;

  const callReceipts: string[] = [];
  let call: MemoCall;
  if (a.strength < 35) callReceipts.push(`thesis strength ${a.strength} < 35 — the engine already grades it ${a.verdict}`);
  if (avgScore < 40) callReceipts.push(`average answer score ${avgScore} < 40 — the grilling didn't hold`);
  if (dodgedCritical >= 2) callReceipts.push(`${dodgedCritical} critical questions dodged or skipped`);
  if (callReceipts.length > 0) {
    call = "STAND DOWN";
  } else if (a.strength >= 55 && avgScore >= 65 && dodgedCritical === 0) {
    call = "PROCEED";
    callReceipts.push(
      `thesis strength ${a.strength} ≥ 55`,
      `average answer score ${avgScore} ≥ 65`,
      "no critical question dodged",
    );
  } else {
    call = "PROCEED REDUCED";
    callReceipts.push(
      `thesis strength ${a.strength} and answer average ${avgScore} clear the floor but not the bar (55 / 65)`,
      dodgedCritical === 1 ? "1 critical question dodged" : "no critical question dodged",
    );
  }

  const killConditions = a.assumptions.flatMap((asm) => asm.killEvidence.slice(0, 1)).slice(0, 6);
  const openQuestions = record
    .filter((r) => !r.answer || r.answer.skipped || r.answer.grade.label === "Dodged")
    .map((r) => r.question.prompt);

  return {
    date: new Date().toISOString().slice(0, 10),
    call,
    callReceipts,
    thesisLine: `${a.direction} · ${a.instrumentLabel} · ${a.horizonDays}d${a.targetPrice !== null ? ` · target $${a.targetPrice}` : ""}`,
    strength: a.strength,
    verdict: a.verdict,
    headline: a.headline,
    avgScore,
    dodgedCritical,
    record,
    killConditions,
    openQuestions,
  };
}

export function memoMarkdown(memo: DecisionMemo): string {
  const lines: string[] = [
    `# Decision Memo — ${memo.thesisLine}`,
    `${memo.date} · A3RO Thesis Lab · deterministic record · not investment advice`,
    "",
    `## Call: ${memo.call}`,
    ...memo.callReceipts.map((r) => `- ${r}`),
    "",
    "## Thesis under test",
    `- ${memo.thesisLine}`,
    `- Strength ${memo.strength}/100 · ${memo.verdict}`,
    `- ${memo.headline}`,
    "",
    `## Grilling record — ${memo.record.length} questions · answer average ${memo.avgScore}/100 · ${memo.dodgedCritical} critical dodged`,
  ];
  memo.record.forEach(({ question, answer }, i) => {
    lines.push("", `### Q${i + 1} · ${GRILL_KIND_LABEL[question.kind]}${question.critical ? " · critical" : ""}`);
    lines.push(question.prompt);
    if (!answer || answer.skipped) {
      lines.push("", "**Skipped — recorded as conceded.**");
    } else {
      lines.push("", `> ${answer.text.replace(/\n/g, "\n> ")}`);
      lines.push("", `**${answer.grade.label} (${answer.grade.score}/100)** — ${answer.grade.receipts.join("; ")}`);
    }
  });
  if (memo.killConditions.length > 0) {
    lines.push("", "## Kill conditions to monitor");
    lines.push(...memo.killConditions.map((k) => `- ${k}`));
  }
  if (memo.openQuestions.length > 0) {
    lines.push("", "## Open questions — dodged or skipped");
    lines.push(...memo.openQuestions.map((q) => `- ${q}`));
  }
  return lines.join("\n");
}

export const callColorKey = (call: MemoCall): "mint" | "amber" | "pink" =>
  call === "PROCEED" ? "mint" : call === "PROCEED REDUCED" ? "amber" : "pink";
