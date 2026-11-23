"use client";
import { useState } from "react";

export interface ControlRow { id: string; label: string; data: "open" | "market"; defaultLevel: string; level: string | null; fitRating: number | null }

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: r.ok, json };
}

export function ModuleControls({ rows }: { rows: ControlRow[] }) {
  const [state, setState] = useState(rows);
  const [message, setMessage] = useState("");

  async function save(id: string, patch: { level?: string | null; fitRating?: number | null }) {
    setMessage("Saving…");
    const { ok, json } = await post("/api/owner/settings", { moduleId: id, ...patch });
    if (!ok) { setMessage(String(json.error ?? "Couldn't save")); return; }
    setState((s) => s.map((r) => r.id === id ? { ...r, ...(patch.level !== undefined ? { level: patch.level === "default" ? null : patch.level } : {}), ...(patch.fitRating !== undefined ? { fitRating: patch.fitRating } : {}) } : r));
    setMessage("Saved. Access changes apply within 30 seconds.");
  }

  const select = "rounded-sm border border-[var(--line)] bg-[var(--depth-0)] px-2 py-1 text-xs";
  return <div>
    <table className="w-full text-xs">
      <thead><tr className="text-left text-[var(--ink-3)]"><th className="pb-2 font-normal">Module</th><th className="pb-2 font-normal">Data</th><th className="pb-2 font-normal">Access</th><th className="pb-2 font-normal">Strategic fit</th></tr></thead>
      <tbody>{state.map((r) => <tr key={r.id} className="border-t border-[var(--line)]">
        <td className="py-2 pr-3">{r.label}</td>
        <td className="py-2 pr-3 text-[var(--ink-3)]">{r.data === "market" ? "market data" : "open data"}</td>
        <td className="py-2 pr-3">
          <select aria-label={`Access for ${r.label}`} className={select} value={r.level ?? "default"} onChange={(e) => save(r.id, { level: e.target.value })}>
            <option value="default">Default ({r.defaultLevel})</option>
            <option value="public" disabled={r.data === "market"}>Public{r.data === "market" ? " (needs a data licence)" : ""}</option>
            <option value="owner">Owner only</option>
            <option value="subscriber">Subscribers (owner only for now)</option>
          </select>
        </td>
        <td className="py-2">
          <select aria-label={`Strategic fit for ${r.label}`} className={select} value={r.fitRating ?? ""} onChange={(e) => save(r.id, { fitRating: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Not rated (3)</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </td>
      </tr>)}</tbody>
    </table>
    {message ? <p role="status" className="mt-3 text-xs text-[var(--ink-2)]">{message}</p> : null}
  </div>;
}

export function CronControls({ jobs }: { jobs: readonly string[] }) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function run(job: string) {
    setRunning(job); setResult(null);
    const { json } = await post("/api/owner/cron", { job });
    setResult(json); setRunning(null);
  }

  return <div>
    <div className="flex flex-wrap gap-2">
      {jobs.map((j) => <button key={j} type="button" disabled={running !== null} onClick={() => run(j)}
        className="rounded-sm border border-[var(--line)] px-3 py-1.5 font-mono text-xs hover:border-[var(--line-2)] disabled:opacity-50">
        {running === j ? `Running ${j}…` : j}
      </button>)}
    </div>
    {result ? <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-[var(--line)] p-3 text-[11px] text-[var(--ink-2)]">{JSON.stringify(result, null, 2)}</pre> : null}
  </div>;
}
