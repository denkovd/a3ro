"use client";
import { useState } from "react";

export default function MarkDone({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setState("saving");
    const r = await fetch("/api/owner/manual-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, note }) });
    const body = await r.json().catch(() => ({})) as { error?: string };
    if (r.ok) { setState("done"); setTimeout(() => location.reload(), 600); }
    else { setError(body.error ?? "Couldn't save"); setState("error"); }
  }

  if (state === "done") return <span className="text-xs text-[var(--ink-2)]">Saved</span>;
  return <span className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note (optional)" aria-label="Note"
      className="w-40 rounded-sm border border-[var(--line)] bg-transparent px-2 py-1 text-xs" />
    <button type="button" onClick={save} disabled={state === "saving"}
      className="rounded-sm border border-[var(--line)] px-3 py-1 font-mono text-xs hover:border-[var(--line-2)] disabled:opacity-50">
      {state === "saving" ? "Saving…" : "Mark done"}
    </button>
    {state === "error" ? <span role="alert" className="text-xs text-[#e5484d]">{error}</span> : null}
  </span>;
}
