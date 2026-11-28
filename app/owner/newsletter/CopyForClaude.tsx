"use client";
import { useState } from "react";

/** Copies this week's issue data plus the reply format, to paste into a Claude chat when drafting by hand (no API key). */
export default function CopyForClaude({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); }
    catch { setState("failed"); }
    setTimeout(() => setState("idle"), 4000);
  }
  return <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <button type="button" onClick={copy} className="rounded-sm border border-[var(--ink)] px-3 py-1.5 text-xs text-[var(--ink)]">Copy data for Claude</button>
      <span role="status" className="text-xs text-[var(--ink-2)]">
        {state === "copied" ? "Copied. Paste it into Claude and ask for this week's editorial." : state === "failed" ? "Couldn't copy: select the text below instead." : "This week's flips, weather, commodities and calendar, plus the reply format."}
      </span>
    </div>
    <details className="text-xs text-[var(--ink-2)]"><summary className="cursor-pointer">Show the text</summary>
      <textarea readOnly rows={10} value={text} className="mt-2 w-full rounded-sm border border-[var(--line)] bg-transparent p-2 font-mono text-[11px] text-[var(--ink)]" />
    </details>
  </div>;
}
