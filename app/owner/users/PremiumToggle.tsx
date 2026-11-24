"use client";
import { useState } from "react";

/** Premium checkbox for one account. Admin accounts always have Premium, so theirs is locked on. */
export default function PremiumToggle({ userId, email, premium, locked }: { userId: string; email: string; premium: boolean; locked: boolean }) {
  const [on, setOn] = useState(premium);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function change(next: boolean) {
    setOn(next);
    setState("saving");
    try {
      const res = await fetch("/api/owner/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, premium: next }) });
      if (!res.ok) throw new Error();
      setState("idle");
    } catch {
      setOn(!next);
      setState("error");
    }
  }

  return <label className="inline-flex items-center justify-end gap-2">
    {state === "error" ? <span role="alert" className="text-[#e5484d]">not saved</span> : null}
    {state === "saving" ? <span className="text-[var(--ink-3)]">saving…</span> : null}
    <input type="checkbox" checked={locked || on} disabled={locked || state === "saving"} onChange={(e) => change(e.target.checked)}
      aria-label={`Premium for ${email}`} className="h-4 w-4 accent-[var(--ink)]" />
  </label>;
}
