"use client";
// "Get this weekly" sign-up (roadmap #9). Stored via /api/leads with a context naming the page, so
// Ops → Growth shows which pages bring readers in. Subscribers are added to Loops by hand for now.
import { useState, type FormEvent } from "react";
import { track } from "./track";

export default function NewsletterSignup({ context, title, blurb }: { context: string; title: string; blurb: string }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? ""), company: String(form.get("company") ?? ""), context: `newsletter:${context}` }),
      });
      setState(response.ok ? "ok" : "error");
      if (response.ok) track("signup", { target: `newsletter:${context}` });
    } catch {
      setState("error");
    }
  }

  return <section aria-labelledby={`signup-${context}`} className="mt-16 rounded-sm border border-[var(--line)] p-6 md:p-8">
    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-3)]">Free weekly note</p>
    <h2 id={`signup-${context}`} className="mt-3 text-xl font-medium text-[var(--ink)]">{title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">{blurb}</p>
    {state === "ok"
      ? <p role="status" className="mt-5 text-sm text-[var(--ink-2)]">You&rsquo;re on the list. The next issue will reach you this week.</p>
      : <form onSubmit={submit} className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Email</span>
          <input name="email" type="email" required autoComplete="email" maxLength={320} placeholder="you@example.com"
            className="w-full rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base text-[var(--ink)] outline-none focus:border-[var(--line-2)]" />
        </label>
        {/* Honeypot: hidden from people, filled by bots. */}
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <button type="submit" disabled={state === "sending"} className="rounded-sm border border-[var(--line)] px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink)] hover:border-[var(--line-2)]">
          {state === "sending" ? "Sending…" : "Get it weekly"}
        </button>
      </form>}
    {state === "error" ? <p role="alert" className="mt-3 text-sm text-[var(--ink-2)]">That didn&rsquo;t go through. Try again in a minute.</p> : null}
    <p className="mt-4 text-[11px] text-[var(--ink-3)]">General information only. Unsubscribe any time. <a href="/privacy" className="underline">Privacy</a>.</p>
  </section>;
}
