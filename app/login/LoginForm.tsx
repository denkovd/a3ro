"use client";
// Email sign-in (roadmap #105): sign in with a password; create an account with just an email
// (the emailed link asks for the first password); or get a reset link to choose a new one.
// Google sits above this form on the login page.
import { useState, type FormEvent } from "react";

const inputClass = "rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base outline-none focus:border-[var(--line-2)]";
const linkClass = "w-fit text-left text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-2)]";
type Mode = "signin" | "signup" | "reset";
type State = "idle" | "sending" | "error" | "confirm" | "reset-sent";

const ENDPOINT: Record<Mode, string> = { signin: "/auth/password", signup: "/auth/signup", reset: "/auth/reset" };
const BUSY: Record<Mode, string> = { signin: "Signing in…", signup: "Creating account…", reset: "Sending…" };
const SUBMIT: Record<Mode, string> = { signin: "Sign in ↗", signup: "Email me a sign-up link ↗", reset: "Email me a reset link ↗" };

export default function LoginForm({ next, initialMode = "signin" }: { next: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

  const switchTo = (m: Mode) => { setMode(m); setState("idle"); setMessage(""); };
  const fail = (text: string) => { setMessage(text); setState("error"); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setState("sending");
    try {
      const payload = mode === "signin" ? { email, password, next } : { email };
      const response = await fetch(ENDPOINT[mode], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({})) as { error?: string; next?: string };
      if (!response.ok) return fail(response.status === 429 ? "Too many attempts. Try again in a few minutes." : body.error ?? "Something went wrong.");
      if (mode === "signin") { window.location.assign(body.next ?? next); return; }
      setState(mode === "signup" ? "confirm" : "reset-sent");
    } catch {
      fail("Something went wrong.");
    }
  }

  if (state === "confirm") return <div role="status" className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--ink-2)]">
    <p>Check {email} for a link and open it in this browser. It confirms your email and asks you to choose your password. From then on, sign in with your email and password.</p>
    <p>Can&rsquo;t see the email after a few minutes? Check your junk folder, or <button type="button" onClick={() => switchTo("signup")} className="underline">send it again</button>.</p>
  </div>;

  if (state === "reset-sent") return <div role="status" className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--ink-2)]">
    <p>If {email} has an account, we&rsquo;ve sent it a link. Open it in this browser and you&rsquo;ll be asked to choose a new password.</p>
    <p>No email after a few minutes? Check your junk folder, or <button type="button" onClick={() => switchTo("signup")} className="underline">create an account</button>.</p>
  </div>;

  return <div className="flex flex-col gap-5">
    {mode !== "reset" ? <div role="tablist" className="flex gap-6 border-b border-[var(--line)]">
      {(["signin", "signup"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
        className={`-mb-px border-b pb-2 font-mono text-xs uppercase tracking-[0.2em] transition-colors ${mode === m ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]"}`}>
        {m === "signin" ? "Sign in" : "Create account"}
      </button>)}
    </div> : <p className="text-sm leading-relaxed text-[var(--ink-2)]">Forgot your password, or never set one? We&rsquo;ll email you a link to choose a new one.</p>}

    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="landing-kicker">Email</span>
        <input name="email" type="email" required autoComplete="email" maxLength={320} value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </label>
      {mode === "signin" ? <label className="flex flex-col gap-2">
        <span className="landing-kicker">Password</span>
        <input name="password" type="password" required maxLength={128} autoComplete="current-password" className={inputClass} />
      </label> : null}
      {mode === "signup" ? <p className="text-xs leading-relaxed text-[var(--ink-3)]">We&rsquo;ll email you a link. Open it to confirm your email and choose your password.</p> : null}
      <button type="submit" disabled={state === "sending"} className="sweep w-fit font-mono text-xs uppercase tracking-[0.2em]">
        {state === "sending" ? BUSY[mode] : SUBMIT[mode]}
      </button>
      {state === "error" ? <p role="alert" className="text-sm text-[var(--ink-2)]">{message}</p> : null}
    </form>

    {mode === "signin" ? <button type="button" onClick={() => switchTo("reset")} className={linkClass}>Forgot your password, or never set one?</button> : null}
    {mode === "reset" ? <button type="button" onClick={() => switchTo("signin")} className={linkClass}>Back to sign in</button> : null}
  </div>;
}
