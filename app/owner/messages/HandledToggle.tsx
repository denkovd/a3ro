"use client";
import { useState } from "react";

/** "Done" checkbox for one member message. */
export default function HandledToggle({ id, handled }: { id: number; handled: boolean }) {
  const [on, setOn] = useState(handled);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function change(next: boolean) {
    setOn(next);
    setState("saving");
    try {
      const res = await fetch("/api/owner/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, handled: next }) });
      if (!res.ok) throw new Error();
      setState("idle");
    } catch {
      setOn(!next);
      setState("error");
    }
  }

  return <label className="inline-flex items-center justify-end gap-2">
    {state === "error" ? <span role="alert" className="text-[#e5484d]">not saved</span> : null}
    <input type="checkbox" checked={on} disabled={state === "saving"} onChange={(e) => change(e.target.checked)}
      aria-label={`Message ${id} done`} className="h-4 w-4 accent-[var(--ink)]" />
  </label>;
}
