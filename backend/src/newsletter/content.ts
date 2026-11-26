/* ────────────────────────────────────────────────────────────────
   Weekly newsletter issue (roadmap #36): Australia Pulse, US macro
   weather, oil flows. Open data and derived reads only (#18): no raw
   Yahoo or other licensed market numbers. gatherIssueData reads the
   database; renderIssue is pure (tested) and leaves an
   {{UNSUBSCRIBE_URL}} placeholder that each send fills per recipient.
──────────────────────────────────────────────────────────────── */
import { computePulse } from "../australia/pulse";
import { AUSTRALIA_REGISTRY, isAustraliaIndicator } from "../australia/registry";
import { computeMacroWeather } from "../macro/weather";
import type { Queryable } from "../storage/db";
import { getAustraliaObservations } from "../storage/australiaWatchRepo";
import { getLatestMacroSnapshot } from "../storage/macroRepo";

export const UNSUBSCRIBE_PLACEHOLDER = "{{UNSUBSCRIBE_URL}}";

export interface IssueData {
  issueDate: string;
  generatedAt: string;
  pulse: {
    label: string;
    growth: { state: string | null; up: number; down: number };
    inflation: { state: string | null; up: number; down: number };
    moved: { label: string; period: string; zChange: number }[];
  } | null;
  macro: {
    quadrant: string;
    headline: string;
    weather: { emoji: string; label: string; reasons: string[] };
    liquidity: string | null;
    runDate: string;
  } | null;
  oil: {
    chokepoints: { name: string; last7: number; prior7: number; changePct: number; through: string }[];
    crudeStocks: { value: number; change: number | null; date: string } | null;
    wti: { value: number; change: number | null; date: string } | null;
  } | null;
}

const CHOKEPOINTS: { id: string; name: string }[] = [
  { id: "hormuz", name: "Strait of Hormuz" },
  { id: "bab_el_mandeb", name: "Bab el-Mandeb" },
  { id: "suez", name: "Suez Canal" },
  { id: "cape", name: "Cape of Good Hope" },
  { id: "singapore", name: "Singapore Strait" },
  { id: "panama", name: "Panama Canal" },
];

const dateStr = (v: unknown) => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
  : String(v).slice(0, 10));

/** Average of the latest 7 daily values against the 7 before them. Values are newest first. */
export function weekOnWeek(newestFirst: number[]): { last7: number; prior7: number; changePct: number } | null {
  if (newestFirst.length < 14) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const last7 = avg(newestFirst.slice(0, 7)), prior7 = avg(newestFirst.slice(7, 14));
  if (!(prior7 > 0)) return null;
  return { last7, prior7, changePct: (last7 / prior7 - 1) * 100 };
}

async function gatherOil(db: Queryable): Promise<IssueData["oil"]> {
  const res = await db.query(
    `select corridor, metric, period_date, value from (
       select corridor, metric, period_date, value,
              row_number() over (partition by corridor, metric order by period_date desc) as rn
         from corridor_metrics
        where (metric = 'tanker_transits' and corridor = any($1)) or (corridor = 'usgulf' and metric in ('us_crude_stocks', 'wti_spot'))
     ) x where rn <= 14 order by corridor, metric, period_date desc`,
    [CHOKEPOINTS.map((c) => c.id)],
  );
  const series = new Map<string, { date: string; value: number }[]>();
  for (const r of res.rows) {
    const k = `${r.corridor}|${r.metric}`;
    const list = series.get(k) ?? [];
    list.push({ date: dateStr(r.period_date), value: Number(r.value) });
    series.set(k, list);
  }
  const chokepoints = CHOKEPOINTS.flatMap((c) => {
    const s = series.get(`${c.id}|tanker_transits`) ?? [];
    const w = weekOnWeek(s.map((p) => p.value));
    return w ? [{ name: c.name, ...w, through: s[0].date }] : [];
  });
  const latestPair = (key: string, back: number) => {
    const s = series.get(key) ?? [];
    if (!s.length) return null;
    const prev = s[back];
    return { value: s[0].value, change: prev ? s[0].value - prev.value : null, date: s[0].date };
  };
  const crudeStocks = latestPair("usgulf|us_crude_stocks", 1); // weekly series: change on the week
  const wti = latestPair("usgulf|wti_spot", 5); // daily trading series: change over five sessions
  if (!chokepoints.length && !crudeStocks && !wti) return null;
  return { chokepoints, crudeStocks, wti };
}

export async function gatherIssueData(db: Queryable, issueDate: string, now = new Date()): Promise<IssueData> {
  const [pulse, macro, oil] = await Promise.all([
    getAustraliaObservations(db).then((obs) => {
      const p = computePulse(obs, { now, leads: false });
      return {
        label: p.quadrant.label,
        growth: { state: p.quadrant.growth, up: p.growth.up, down: p.growth.down },
        inflation: { state: p.quadrant.inflation, up: p.inflation.up, down: p.inflation.down },
        moved: p.moved.slice(0, 3).map((m) => ({
          label: isAustraliaIndicator(m.indicator) ? AUSTRALIA_REGISTRY[m.indicator].label : m.indicator,
          period: m.period, zChange: m.zChange,
        })),
      };
    }).catch(() => null),
    getLatestMacroSnapshot(db).then((snap) => {
      if (!snap || snap.quadrant === "PENDING") return null;
      const w = computeMacroWeather({
        economicRegime: snap.quadrant, marketRegime: snap.marketRegime, riskOnShare: snap.marketRiskOn,
        liquidityScore: snap.liquidityScore, liquidityLegs: snap.liquidityLegs,
      });
      return {
        quadrant: snap.quadrant, headline: snap.regimeHeadline, runDate: snap.runDate,
        weather: { emoji: w.emoji, label: w.label, reasons: w.reasons.slice(0, 3) },
        liquidity: snap.liquidityHeadline || null,
      };
    }).catch(() => null),
    gatherOil(db).catch(() => null),
  ]);
  return { issueDate, generatedAt: now.toISOString(), pulse, macro, oil };
}

/* ── rendering ─────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sign = (n: number, dp = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}`;
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const QUADRANT_WORDS: Record<string, string> = {
  GOLDILOCKS: "Goldilocks (growth up, inflation down)", REFLATION: "Reflation (growth up, inflation up)",
  INFLATION: "Stagflation risk (growth down, inflation up)", DEFLATION: "Slowdown (growth down, inflation down)",
};
const axisWords = (state: string | null, up: number, down: number, upWord: string, downWord: string) =>
  state === null ? "not enough current readings" : `${state === "up" ? upWord : state === "down" ? downWord : "mixed"} (${up} up, ${down} down)`;

export const GENERAL_ADVICE_WARNING =
  "General information only. A3RO does not know your objectives, financial situation or needs, and nothing here is a recommendation to buy or sell anything. Consider whether it suits you and seek independent advice before acting.";

export interface RenderedIssue { subject: string; html: string; text: string }

export function renderIssue(data: IssueData, siteUrl = "https://a3ro.com.au"): RenderedIssue {
  const site = siteUrl.replace(/\/$/, "");
  const sections: { title: string; link: string; linkText: string; lines: string[] }[] = [];

  if (data.pulse) {
    const p = data.pulse;
    sections.push({
      title: "Australia Pulse", link: `${site}/Projects/Australia-Watch`, linkText: "Open Australia Watch",
      lines: [
        p.label + ".",
        `Leading growth indicators: ${axisWords(p.growth.state, p.growth.up, p.growth.down, "improving", "weakening")}.`,
        `Price pressure: ${axisWords(p.inflation.state, p.inflation.up, p.inflation.down, "building", "easing")}.`,
        ...(p.moved.length ? [`Biggest moves: ${p.moved.map((m) => `${m.label} (${m.period}, ${sign(m.zChange, 1)}σ)`).join("; ")}.`] : []),
      ],
    });
  }
  if (data.macro) {
    const m = data.macro;
    sections.push({
      title: `US macro weather: ${m.weather.emoji} ${m.weather.label}`, link: `${site}/Projects/Regime-Shift`, linkText: "Open US regime",
      lines: [
        `Economic regime: ${QUADRANT_WORDS[m.quadrant] ?? m.quadrant}.${m.headline ? ` ${m.headline}` : ""}`,
        ...m.weather.reasons.map((r) => r.endsWith(".") ? r : `${r}.`),
        ...(m.liquidity ? [m.liquidity.endsWith(".") ? m.liquidity : `${m.liquidity}.`] : []),
      ],
    });
  }
  if (data.oil) {
    const o = data.oil;
    const lines: string[] = [];
    if (o.chokepoints.length) {
      lines.push(`Tanker transits, last 7 days against the 7 before (to ${o.chokepoints[0].through}):`);
      for (const c of o.chokepoints) lines.push(`• ${c.name}: ${c.last7.toFixed(1)} a day (${sign(c.changePct, 0)}%)`);
    }
    // Stored in millions of barrels (EIA commercial stocks, ex-SPR), e.g. 417.8.
    if (o.crudeStocks) lines.push(`US crude stocks: ${o.crudeStocks.value.toFixed(1)} million barrels${o.crudeStocks.change !== null ? `, ${sign(o.crudeStocks.change, 1)} million on the week` : ""} (EIA, week to ${o.crudeStocks.date}).`);
    if (o.wti) lines.push(`WTI spot: US$${o.wti.value.toFixed(2)}${o.wti.change !== null ? ` (${sign(o.wti.change, 2)} over five sessions)` : ""} (EIA, ${o.wti.date}).`);
    sections.push({ title: "Oil flows", link: `${site}/Projects/Oil-Tracker`, linkText: "Open the oil globe", lines });
  }

  const heading = `A3RO weekly · ${longDate(data.issueDate)}`;
  const subject = data.macro ? `${heading} · ${data.macro.weather.emoji} ${data.macro.weather.label}` : heading;

  const text = [
    heading, "",
    ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines, `${s.linkText}: ${s.link}`, ""]),
    ...(sections.length ? [] : ["No fresh readings this week.", ""]),
    "Sources: ABS, RBA, OECD, FRED, EIA, IMF PortWatch.",
    GENERAL_ADVICE_WARNING, "",
    `You're getting this because you signed up at a3ro.com.au. Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
  ].join("\n");

  const block = (s: (typeof sections)[number]) => `
    <tr><td style="padding:24px 0 0">
      <h2 style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#111">${esc(s.title)}</h2>
      ${s.lines.map((l) => `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:#333">${esc(l)}</p>`).join("")}
      <p style="margin:10px 0 0"><a href="${esc(s.link)}" style="font-size:14px;color:#0b6e4f">${esc(s.linkText)} →</a></p>
    </td></tr>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e3e6e3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<tr><td style="padding:28px 28px 8px">
  <p style="margin:0;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6b746f">A3RO Intelligence</p>
  <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#111">${esc(heading)}</h1>
</td></tr>
<tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${sections.length ? sections.map(block).join("") : `<tr><td style="padding:24px 0 0;font-size:15px;color:#333">No fresh readings this week.</td></tr>`}
</table></td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e3e6e3">
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b746f">Sources: ABS, RBA, OECD, FRED, EIA, IMF PortWatch.</p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#6b746f">${esc(GENERAL_ADVICE_WARNING)}</p>
  <p style="margin:0;font-size:12px;line-height:1.5;color:#6b746f">You're getting this because you signed up at <a href="${esc(site)}" style="color:#6b746f">a3ro.com.au</a>. <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#6b746f">Unsubscribe</a></p>
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text };
}
