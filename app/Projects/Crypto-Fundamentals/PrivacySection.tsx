/* Privacy top 10 (roadmap #87): a static, sourced comparison, reviewed each quarter.
   Free: facts and links only, no market data. Commit counts come from the daily job. */
import { PRIVACY_PROJECTS, PRIVACY_REVIEWED, type PrivacyDev } from "@a3ro/oil-backend";

const reviewed = new Date(`${PRIVACY_REVIEWED}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function CommitSpark({ d }: { d: PrivacyDev }) {
  const w = 72, h = 18, last = d.weekly.slice(-52), max = Math.max(...last, 1), step = w / Math.max(last.length - 1, 1);
  const pts = last.map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${d.commits52w} commits in the last 52 weeks`} className="inline-block align-middle">
    <polyline points={pts} fill="none" stroke="#b8e278" strokeWidth={1.2} />
  </svg>;
}

function Dev({ d }: { d: PrivacyDev | undefined }) {
  if (!d) return <span className="text-[var(--ink-3)]">not loaded</span>;
  return <span className="whitespace-nowrap">{d.commits52w.toLocaleString("en-AU")} <CommitSpark d={d} /></span>;
}

export default function PrivacySection({ dev }: { dev?: Record<string, PrivacyDev> }) {
  return <section aria-label="Privacy: the top 10 compared" className="flex flex-col gap-4">
    <div className="flex max-w-3xl flex-col gap-2">
      <p className="landing-kicker">Privacy · the top 10 compared</p>
      <h2 className="text-xl font-medium">How private, and how usable?</h2>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">Ten ways to move money privately, side by side. Strong privacy is worth little if no exchange will touch it, so access counts as much as the cryptography. We don&rsquo;t rate security ourselves; we list audits and incidents, with sources. Reviewed by hand each quarter; last reviewed {reviewed}.</p>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead><tr className="border-b border-[var(--line)] text-left text-xs text-[var(--ink-3)]">
          <th className="py-2 pr-3 font-normal">Project</th>
          <th className="py-2 pr-3 font-normal">Private by default?</th>
          <th className="py-2 pr-3 font-normal">Trusted setup</th>
          <th className="py-2 pr-3 font-normal">In Australia</th>
          <th className="py-2 pr-3 text-right font-normal">Commits, 12 months</th>
        </tr></thead>
        <tbody>{PRIVACY_PROJECTS.map((p) => <tr key={p.id} className="border-b border-[var(--line)] align-top">
          <td className="py-2.5 pr-3"><a href={`#privacy-${p.id}`} className="font-medium underline-offset-2 hover:underline">{p.name}</a><span className="block text-[11px] text-[var(--ink-3)]">{p.kind}</span></td>
          <td className="max-w-[220px] py-2.5 pr-3 text-xs leading-relaxed">{p.byDefault}</td>
          <td className="max-w-[180px] py-2.5 pr-3 text-xs leading-relaxed">{p.trustedSetup}</td>
          <td className="max-w-[200px] py-2.5 pr-3 text-xs leading-relaxed">{p.australia}</td>
          <td className="py-2.5 pr-3 text-right font-mono text-xs">{p.repo ? <Dev d={dev?.[p.id]} /> : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="grid items-start gap-3 md:grid-cols-2">
      {PRIVACY_PROJECTS.map((p) => <details key={p.id} id={`privacy-${p.id}`} className="rounded-lg border border-[var(--line)] p-4 open:bg-white/[0.02]">
        <summary className="cursor-pointer list-none">
          <span className="font-medium">{p.name}</span> <span className="text-xs text-[var(--ink-3)]">· {p.kind}</span>
          <span className="mt-1 block text-sm leading-relaxed text-[var(--ink-2)]">{p.summary}</span>
          <span className="mt-1 block text-[11px] text-[var(--ink-3)]">Details and sources ▾</span>
        </summary>
        <dl className="mt-3 grid gap-2 text-xs leading-relaxed">
          {([["How it works", p.method], ["Audits", p.audits], ["Incidents", p.incidents], ["Access", p.access]] as const).map(([k, v]) =>
            <div key={k}><dt className="text-[var(--ink-3)]">{k}</dt><dd className={v === "Not checked" ? "text-[var(--ink-3)]" : ""}>{v}</dd></div>)}
          {p.repo ? <div><dt className="text-[var(--ink-3)]">Development</dt><dd><a className="underline" href={`https://github.com/${p.repo}`}>{p.repo}</a>{dev?.[p.id] ? `: ${dev[p.id].commits52w.toLocaleString("en-AU")} commits in 12 months, ${dev[p.id].commits13w.toLocaleString("en-AU")} in the last 3` : ""}</dd></div> : null}
          <div><dt className="text-[var(--ink-3)]">Sources</dt><dd><ul className="list-disc pl-4">{p.sources.map((s) => <li key={s.url}><a className="underline" href={s.url} rel="noopener noreferrer" target="_blank">{s.label}</a></li>)}</ul></dd></div>
        </dl>
      </details>)}
    </div>
    <p className="max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">&ldquo;Not checked&rdquo; means we haven&rsquo;t confirmed it yet, not that the answer is no. Commit counts are for one main repository per project on GitHub, so they show activity, not quality. Not advice; rules on privacy coins change often, so check your exchange before buying.</p>
  </section>;
}
