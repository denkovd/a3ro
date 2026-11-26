"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "generate" | "test" | "approve" | "unapprove";
const LABEL: Record<Action, string> = { generate: "Generate this week's issue", test: "Send test to me", approve: "Approve for Monday 6pm", unapprove: "Back to draft" };

/** Buttons for one issue (or just Generate when there is none). Each one posts to /api/owner/newsletter. */
export default function NewsletterActions({ id, actions }: { id?: number; actions: Action[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setNote(null);
    try {
      const res = await fetch("/api/owner/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      const body = await res.json().catch(() => ({})) as { error?: string; to?: string };
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
      setNote({ ok: true, text: action === "test" ? `Test sent to ${body.to}.` : action === "generate" ? "Draft ready." : "Saved." });
      router.refresh();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    {actions.map((a) => <button key={a} type="button" disabled={busy !== null} onClick={() => run(a)}
      className={`rounded-sm border px-3 py-1.5 text-xs disabled:opacity-50 ${a === "approve" ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"}`}>
      {busy === a ? "Working…" : LABEL[a]}
    </button>)}
    {note ? <span role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? "text-[var(--ink-2)]" : "text-[#e5484d]"}`}>{note.text}</span> : null}
  </div>;
}
