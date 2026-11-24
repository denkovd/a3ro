"use client";
import { useState, type FormEvent } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setState("sending");
    try {
      const response = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next }) });
      if (response.ok) { setState("sent"); return; }
      const body = await response.json().catch(() => ({})) as { error?: string };
      setMessage(response.status === 429 ? "Too many attempts. Try again in a few minutes." : body.error ?? "Something went wrong.");
      setState("error");
    } catch {
      setMessage("Something went wrong.");
      setState("error");
    }
  }

  if (state === "sent") return <p role="status" className="text-sm leading-relaxed text-[var(--ink-2)]">Check your email for a sign-in link and open it in this browser. If you don&rsquo;t have an account yet, the link creates one.</p>;

  return <form onSubmit={submit} className="flex flex-col gap-4">
    <label className="flex flex-col gap-2">
      <span className="landing-kicker">Email</span>
      <input name="email" type="email" required autoComplete="email" maxLength={320}
        className="rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--line-2)]" />
    </label>
    <button type="submit" disabled={state === "sending"} className="sweep w-fit font-mono text-xs uppercase tracking-[0.2em]">
      {state === "sending" ? "Sending…" : "Email me a link ↗"}
    </button>
    {state === "error" ? <p role="alert" className="text-sm text-[var(--ink-2)]">{message}</p> : null}
  </form>;
}
