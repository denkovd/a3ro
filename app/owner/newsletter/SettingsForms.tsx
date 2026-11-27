"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postNewsletter } from "./post";

type Consensus = { quadrant: string; source: string; asOf: string; note?: string } | null;
interface Flag { id: number; commodity: string; title: string; detail: string; source: "auto" | "manual"; since: string; active: boolean }

const FIELD = "rounded-sm border border-[var(--line)] bg-transparent px-2 py-1.5 text-xs text-[var(--ink)]";
const BTN = "rounded-sm border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:text-[var(--ink)] disabled:opacity-50";
const QUADRANTS = ["GOLDILOCKS", "REFLATION", "INFLATION", "DEFLATION"];

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(payload: Record<string, unknown>) {
    setBusy(true); setNote(null);
    try { const r = await postNewsletter(payload); setNote({ ok: true, text: r.note ?? "Saved." }); router.refresh(); return true; }
    catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Failed" }); return false; }
    finally { setBusy(false); }
  }
  const status = note ? <span role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? "text-[var(--ink-2)]" : "text-[#e5484d]"}`}>{note.text}</span> : null;
  return { busy, run, status };
}

function ConsensusRow({ label, value, onChange }: { label: string; value: NonNullable<Consensus>; onChange: (v: NonNullable<Consensus>) => void }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className="w-20 text-[var(--ink-2)]">{label}</span>
    <select className={FIELD} value={value.quadrant} onChange={(e) => onChange({ ...value, quadrant: e.target.value })}>
      {QUADRANTS.map((q) => <option key={q} value={q}>{q[0] + q.slice(1).toLowerCase()}</option>)}
    </select>
    <input className={`${FIELD} w-56`} placeholder="Source (e.g. Fed SEP)" value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value })} />
    <input className={FIELD} type="date" value={value.asOf} onChange={(e) => onChange({ ...value, asOf: e.target.value })} />
    <input className={`${FIELD} min-w-[16rem] flex-1`} placeholder="Note (optional)" value={value.note ?? ""} onChange={(e) => onChange({ ...value, note: e.target.value })} />
  </div>;
}

/** US (Fed SEP / SPF) and Australia (RBA SMP) consensus quadrants. Update after each SEP and SMP. */
export function ConsensusForm({ us, au }: { us: Consensus; au: Consensus }) {
  const blank = { quadrant: "GOLDILOCKS", source: "", asOf: "" };
  const [u, setU] = useState(us ?? blank);
  const [a, setA] = useState(au ?? { ...blank, quadrant: "INFLATION" });
  const { busy, run, status } = useRun();
  return <div className="flex flex-col gap-2">
    <ConsensusRow label="US" value={u} onChange={setU} />
    <ConsensusRow label="Australia" value={a} onChange={setA} />
    <div className="flex items-center gap-2"><button type="button" disabled={busy} className={BTN} onClick={() => run({ action: "save-settings", us_consensus: u, au_consensus: a })}>Save consensus</button>{status}</div>
  </div>;
}

/** Ongoing commodity disturbances. Auto flags come and go with the data; resolve any flag to drop it. */
export function RedFlagsForm({ flags }: { flags: Flag[] }) {
  const [n, setN] = useState({ commodity: "", title: "", detail: "", since: "" });
  const { busy, run, status } = useRun();
  return <div className="flex flex-col gap-3">
    <ul className="flex flex-col gap-2">
      {flags.length === 0 ? <li className="text-xs text-[var(--ink-2)]">No red flags.</li> : null}
      {flags.map((f) => <li key={f.id} className={`flex flex-wrap items-start justify-between gap-2 text-xs ${f.active ? "" : "opacity-50"}`}>
        <span><span className="text-[var(--ink)]">🚩 {f.commodity}: {f.title}</span> <span className="text-[var(--ink-2)]">· since {f.since} · {f.source}{f.active ? "" : " · resolved"}</span>{f.detail ? <><br /><span className="text-[var(--ink-2)]">{f.detail}</span></> : null}</span>
        <button type="button" disabled={busy} className={BTN} onClick={() => run({ action: f.active ? "resolve-flag" : "reopen-flag", flagId: f.id })}>{f.active ? "Resolve" : "Reopen"}</button>
      </li>)}
    </ul>
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${FIELD} w-28`} placeholder="Commodity" value={n.commodity} onChange={(e) => setN({ ...n, commodity: e.target.value })} />
      <input className={`${FIELD} w-64`} placeholder="Title" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
      <input className={`${FIELD} min-w-[14rem] flex-1`} placeholder="Detail" value={n.detail} onChange={(e) => setN({ ...n, detail: e.target.value })} />
      <input className={FIELD} type="date" value={n.since} onChange={(e) => setN({ ...n, since: e.target.value })} />
      <button type="button" disabled={busy} className={BTN} onClick={async () => { if (await run({ action: "add-flag", ...n })) setN({ commodity: "", title: "", detail: "", since: "" }); }}>Add flag</button>
    </div>
    {status}
  </div>;
}
