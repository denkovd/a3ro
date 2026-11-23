"use client";
import { useState, type FormEvent } from "react";
import { track } from "../components/track";

/** Email sign-up for a module that isn't public yet (#35). Stored via /api/leads with the module as context. */
export default function SignupForm({ moduleId }: { moduleId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? ""), company: String(form.get("company") ?? ""), context: `waitlist:${moduleId}` }),
      });
      setState(response.ok ? "ok" : "error");
      if (response.ok) track("signup", { target: `waitlist:${moduleId}` });
    } catch {
      setState("error");
    }
  }

  if (state === "ok") return <p role="status" className="text-sm text-[var(--ink-2)]">Thanks. We&rsquo;ll email you when it opens, along with the weekly A3RO note.</p>;

  return <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <label className="flex flex-1 flex-col gap-2">
      <span className="landing-kicker">Get notified when it opens</span>
      <input name="email" type="email" required autoComplete="email" maxLength={320} placeholder="you@example.com"
        className="rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--line-2)]" />
    </label>
    {/* Honeypot: hidden from people, filled by bots. */}
    <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
    <button type="submit" disabled={state === "sending"} className="rounded-sm border border-[var(--line)] px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] hover:border-[var(--line-2)]">
      {state === "sending" ? "Sending…" : "Notify me"}
    </button>
    {state === "error" ? <p role="alert" className="text-sm text-[var(--ink-2)] sm:basis-full">That didn&rsquo;t go through. Try again in a minute.</p> : null}
  </form>;
}
