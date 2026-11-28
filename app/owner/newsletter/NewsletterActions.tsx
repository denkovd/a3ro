"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postNewsletter } from "./post";

type Action = "generate" | "draft-editorial" | "test" | "approve" | "unapprove";
const LABEL: Record<Action, string> = { generate: "Generate this week's issue", "draft-editorial": "Draft editorial with Claude", test: "Send test to me (Free + Premium)", approve: "Approve for Monday 6pm", unapprove: "Back to draft" };

/** Buttons for one issue (or just Generate when there is none). Each one posts to /api/owner/newsletter. */
export default function NewsletterActions({ id, actions }: { id?: number; actions: Action[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setNote(null);
    try {
      const body = await postNewsletter({ action, id });
      setNote({ ok: true, text: action === "test" ? `Two tests sent to ${body.to}.` : body.note ?? (action === "generate" ? "Draft ready." : "Saved.") });
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
