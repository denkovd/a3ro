"use client";
import { useState, type FormEvent } from "react";

const inputClass = "rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--line-2)]";

export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    setState("sending");
    try {
      const response = mode === "link"
        ? await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next }) })
        : await fetch("/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: String(form.get("password") ?? ""), next }) });
      const body = await response.json().catch(() => ({})) as { error?: string; next?: string };
      if (response.ok) {
        if (mode === "password") { window.location.assign(body.next ?? next); return; }
        setState("sent");
        return;
      }
      setMessage(response.status === 429 ? "Too many attempts. Try again in a few minutes." : body.error ?? "Something went wrong.");
      setState("error");
    } catch {
      setMessage("Something went wrong.");
      setState("error");
    }
  }

  if (state === "sent") return <p role="status" className="text-sm leading-relaxed text-[var(--ink-2)]">Check your email for a sign-in link and open it in this browser. If you don&rsquo;t have an account yet, the link creates one.</p>;

  const switchTo = (m: "link" | "password") => { setMode(m); setState("idle"); setMessage(""); };

  return <form onSubmit={submit} className="flex flex-col gap-4">
    <label className="flex flex-col gap-2">
      <span className="landing-kicker">Email</span>
      <input name="email" type="email" required autoComplete="email" maxLength={320} className={inputClass} />
    </label>
    {mode === "password" ? <label className="flex flex-col gap-2">
      <span className="landing-kicker">Password</span>
      <input name="password" type="password" required autoComplete="current-password" maxLength={128} className={inputClass} />
    </label> : null}
    <button type="submit" disabled={state === "sending"} className="sweep w-fit font-mono text-xs uppercase tracking-[0.2em]">
      {state === "sending" ? (mode === "link" ? "Sending…" : "Signing in…") : mode === "link" ? "Email me a link ↗" : "Sign in ↗"}
    </button>
    {state === "error" ? <p role="alert" className="text-sm text-[var(--ink-2)]">{message}</p> : null}
    <button type="button" onClick={() => switchTo(mode === "link" ? "password" : "link")}
      className="w-fit text-left text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-2)]">
      {mode === "link" ? "Have a password? Sign in with it instead" : "Email me a one-time link instead"}
    </button>
  </form>;
}
