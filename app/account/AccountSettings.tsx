"use client";
// Account settings (roadmap #105): name, interests, newsletter, password, feedback,
// sign out everywhere, delete account. Every change goes through /api/account/*.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { INTERESTS } from "../../lib/interests";

interface Settings {
  email: string | null;
  displayName: string | null;
  providerName: string | null;
  providers: string[];
  hasPassword: boolean;
  createdAt: string;
  interests: string[];
  newsletter: boolean;
  premium: boolean;
  premiumSince: string | null;
  admin: boolean;
}

type Status = { state: "idle" | "saving" | "saved" | "error"; message?: string };

const DAY = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" });
const input = "w-full rounded-sm border border-[var(--line)] bg-transparent px-3 py-2 text-base text-[var(--ink)] outline-none focus:border-[var(--line-2)]";
const button = "w-fit rounded-sm border border-[var(--line)] px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink)] transition-colors hover:border-[var(--line-2)] disabled:opacity-50";
const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "Email" };

async function send(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({})) as { error?: string };
    if (res.status === 429) return { ok: false, error: "Too many tries. Wait a few minutes and try again." };
    return res.ok ? { ok: true } : { ok: false, error: json.error ?? "That didn't go through. Try again." };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return <section className="mt-8 rounded-sm border border-[var(--line)] p-6">
    <h2 className="text-lg font-medium text-[var(--ink)]">{title}</h2>
    {intro ? <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">{intro}</p> : null}
    <div className="mt-5 flex flex-col gap-4">{children}</div>
  </section>;
}

function StatusLine({ status, saved = "Saved" }: { status: Status; saved?: string }) {
  if (status.state === "saving") return <span className="text-sm text-[var(--ink-3)]">Saving…</span>;
  if (status.state === "saved") return <span role="status" className="text-sm text-[var(--ink-2)]">{saved}</span>;
  if (status.state === "error") return <span role="alert" className="text-sm text-[#e5484d]">{status.message}</span>;
  return null;
}

export default function AccountSettings({ landing = null }: { landing?: LinkLanding }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) { window.location.assign("/login?next=/account"); return null; }
        return r.ok ? r.json() : Promise.reject(new Error());
      })
      .then((s: Settings | null) => { if (s) setSettings(s); })
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) return <p role="alert" className="text-sm text-[var(--ink-2)]">Your settings couldn&rsquo;t be loaded. Refresh the page to try again.</p>;
  if (!settings) return <p className="text-sm text-[var(--ink-3)]">Loading your settings…</p>;

  return <>
    {/* Arrived from a sign-up or reset link: choosing a password comes first. */}
    {landing ? <PasswordSection settings={settings} onChange={setSettings} landing={landing} /> : null}
    <ProfileSection settings={settings} onChange={setSettings} />
    <InterestsSection settings={settings} onChange={setSettings} />
    <NewsletterSection settings={settings} onChange={setSettings} />
    {landing ? null : <PasswordSection settings={settings} onChange={setSettings} />}
    <FeedbackSection />
    <SessionsSection />
    {settings.admin ? null : <DeleteSection email={settings.email ?? ""} />}
  </>;
}

type SectionProps = { settings: Settings; onChange: (s: Settings) => void };

function ProfileSection({ settings, onChange }: SectionProps) {
  const [name, setName] = useState(settings.displayName ?? settings.providerName ?? "");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const methods = [...settings.providers.map((p) => PROVIDER_LABEL[p] ?? p), ...(settings.hasPassword ? ["Password"] : [])];

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus({ state: "saving" });
    const res = await send("/api/account", "PATCH", { displayName: name });
    if (res.ok) { onChange({ ...settings, displayName: name.trim() || null }); setStatus({ state: "saved" }); }
    else setStatus({ state: "error", message: res.error });
  }

  return <Section title="Profile">
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="landing-kicker">Name</span>
        <input value={name} onChange={(e) => { setName(e.target.value); setStatus({ state: "idle" }); }} maxLength={80} autoComplete="name" placeholder="How we should address you" className={input} />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={status.state === "saving"} className={button}>Save name</button>
        <StatusLine status={status} />
      </div>
    </form>
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-[var(--ink-3)]">Email</dt><dd className="break-all text-[var(--ink)]">{settings.email ?? "—"}</dd>
      <dt className="text-[var(--ink-3)]">Sign-in</dt><dd className="text-[var(--ink)]">{methods.join(", ") || "—"}</dd>
      <dt className="text-[var(--ink-3)]">Member since</dt><dd className="text-[var(--ink)]">{DAY.format(new Date(settings.createdAt))}</dd>
      <dt className="text-[var(--ink-3)]">Plan</dt>
      <dd className="text-[var(--ink)]">
        {settings.premium
          ? <>Premium{settings.admin ? " (admin)" : settings.premiumSince ? ` since ${DAY.format(new Date(settings.premiumSince))}` : ""}</>
          : <>Free · <a href="/private" className="underline">What Premium includes</a></>}
      </dd>
    </dl>
  </Section>;
}

function InterestsSection({ settings, onChange }: SectionProps) {
  const [picked, setPicked] = useState(new Set(settings.interests));
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const groups = ["Modules", "Topics"] as const;

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
    setStatus({ state: "idle" });
  }

  async function save() {
    setStatus({ state: "saving" });
    const interests = INTERESTS.map((i) => i.id).filter((id) => picked.has(id));
    const res = await send("/api/account", "PATCH", { interests });
    if (res.ok) { onChange({ ...settings, interests }); setStatus({ state: "saved" }); }
    else setStatus({ state: "error", message: res.error });
  }

  return <Section title="What you're interested in" intro="Tick what you'd like to hear more about. It shapes the weekly note and what we build next.">
    {groups.map((g) => <fieldset key={g} className="flex flex-col gap-2">
      <legend className="landing-kicker mb-2">{g}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {INTERESTS.filter((i) => i.group === g).map((i) => <label key={i.id} className="flex items-center gap-3 text-sm text-[var(--ink)]">
          <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 accent-[var(--ink)]" />
          {i.label}
        </label>)}
      </div>
    </fieldset>)}
    <div className="flex items-center gap-4">
      <button type="button" onClick={save} disabled={status.state === "saving"} className={button}>Save interests</button>
      <StatusLine status={status} />
    </div>
  </Section>;
}

function NewsletterSection({ settings, onChange }: SectionProps) {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function change(on: boolean) {
    setStatus({ state: "saving" });
    const res = await send("/api/account", "PATCH", { newsletter: on });
    if (res.ok) { onChange({ ...settings, newsletter: on }); setStatus({ state: "saved" }); }
    else setStatus({ state: "error", message: res.error });
  }

  return <Section title="Weekly note" intro="A free weekly email on Australia and US macro, commodities and what moved. General information only.">
    <label className="flex items-center gap-3 text-sm text-[var(--ink)]">
      <input type="checkbox" checked={settings.newsletter} disabled={status.state === "saving"} onChange={(e) => change(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" />
      Send the weekly note to {settings.email}
    </label>
    <StatusLine status={status} saved={settings.newsletter ? "You're subscribed." : "You're unsubscribed. You won't get the weekly note."} />
  </Section>;
}

type LinkLanding = "setup" | "reset" | null;

/**
 * Passwords are only set from an emailed link (the server checks too). Arriving from one
 * (?setup=1 after sign-up, ?reset=1 after a reset) shows the form; otherwise this is one
 * button that emails a reset link to the account's address.
 */
function PasswordSection({ settings, onChange, landing = null }: SectionProps & { landing?: LinkLanding }) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [showForm, setShowForm] = useState(landing !== null);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirm") ?? "")) { setStatus({ state: "error", message: "The two passwords don't match" }); return; }
    setStatus({ state: "saving" });
    const res = await send("/api/account/password", "POST", { password });
    if (res.ok) {
      form.reset();
      onChange({ ...settings, hasPassword: true });
      setShowForm(false);
      setStatus({ state: "saved", message: "Password saved. From now on, sign in with your email and this password." });
      // Drop ?setup=1 / ?reset=1 so a refresh doesn't show the form again.
      window.history.replaceState(null, "", "/account");
    } else setStatus({ state: "error", message: res.error });
  }

  async function emailLink() {
    setStatus({ state: "saving" });
    const res = await send("/auth/reset", "POST", { email: settings.email });
    setStatus(res.ok ? { state: "saved", message: `We've emailed a link to ${settings.email}. Open it in this browser to choose your new password.` } : { state: "error", message: res.error });
  }

  if (!showForm) return <Section title="Password"
    intro={settings.hasPassword ? "To change your password, we'll email you a link. Opening it lets you choose a new one."
      : "You don't have a password yet. We'll email you a link to set one, so you can sign in with your email and password."}>
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={emailLink} disabled={status.state === "saving" || !settings.email} className={button}>
        {settings.hasPassword ? "Email me a reset link" : "Email me a link to set one"}
      </button>
      <StatusLine status={status} saved={status.message} />
    </div>
  </Section>;

  return <Section title={landing === "setup" && !settings.hasPassword ? "Choose your password" : "Choose a new password"}
    intro={landing === "setup" && !settings.hasPassword
      ? "Welcome. Your email is confirmed. Choose a password to sign in with from now on. At least 10 characters."
      : "You're signed in from your email link. Choose a password to sign in with from now on. At least 10 characters."}>
    <form onSubmit={save} className="flex flex-col gap-3">
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" value={settings.email ?? ""} autoComplete="username" readOnly hidden />
      <label className="flex flex-col gap-2">
        <span className="landing-kicker">New password</span>
        <input name="password" type="password" required autoFocus minLength={10} maxLength={128} autoComplete="new-password" className={input} />
      </label>
      <label className="flex flex-col gap-2">
        <span className="landing-kicker">Type it again</span>
        <input name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={input} />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={status.state === "saving"} className={button}>Save password</button>
        <StatusLine status={status} />
      </div>
    </form>
  </Section>;
}

const KINDS = [
  { id: "review", label: "Review" },
  { id: "request", label: "Request a feature" },
  { id: "problem", label: "Report a problem" },
  { id: "other", label: "Something else" },
] as const;

function FeedbackSection() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("request");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ state: "saving" });
    const res = await send("/api/account/feedback", "POST", { kind, message, rating: kind === "review" ? rating : null, page: "/account" });
    if (res.ok) { setMessage(""); setRating(null); setStatus({ state: "saved" }); }
    else setStatus({ state: "error", message: res.error });
  }

  return <Section title="Tell us what you think" intro="Reviews, feature requests and problems all come straight to us. We read every one.">
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Kind of message" className="flex flex-wrap gap-2">
        {KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => { setKind(k.id); setStatus({ state: "idle" }); }}
          className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${kind === k.id ? "border-[var(--ink)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-2)]"}`}>
          {k.label}
        </button>)}
      </div>
      {kind === "review" ? <div className="flex items-center gap-3">
        <span className="landing-kicker">Rating</span>
        <div role="radiogroup" aria-label="Rating out of 5" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} out of 5`} onClick={() => setRating(n)}
            className={`text-xl leading-none ${rating !== null && n <= rating ? "text-[var(--ink)]" : "text-[var(--ink-3)]"} hover:text-[var(--ink)]`}>★</button>)}
        </div>
      </div> : null}
      <label className="flex flex-col gap-2">
        <span className="landing-kicker">Message</span>
        <textarea value={message} onChange={(e) => { setMessage(e.target.value); setStatus({ state: "idle" }); }} required maxLength={4000} rows={5}
          placeholder={kind === "request" ? "What would you like A3RO to track or show?" : kind === "problem" ? "What happened, and on which page?" : "Your message"}
          className={input} />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={status.state === "saving" || !message.trim()} className={button}>Send</button>
        <StatusLine status={status} saved="Thanks, we've got it." />
        <span className="ml-auto text-xs text-[var(--ink-3)]">{message.length}/4000</span>
      </div>
    </form>
  </Section>;
}

function SessionsSection() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  async function signOutEverywhere() {
    setStatus({ state: "saving" });
    const res = await send("/api/account/sessions", "DELETE");
    if (res.ok) window.location.assign("/login?next=/account");
    else setStatus({ state: "error", message: res.error });
  }
  return <Section title="Devices" intro="Lost a phone or signed in on a shared computer? This signs you out everywhere, including here.">
    <div className="flex items-center gap-4">
      <button type="button" onClick={signOutEverywhere} disabled={status.state === "saving"} className={button}>Sign out on all devices</button>
      <StatusLine status={status} />
    </div>
  </Section>;
}

function DeleteSection({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const matches = confirm.trim().toLowerCase() === email.toLowerCase() && email !== "";

  async function remove(e: FormEvent) {
    e.preventDefault();
    setStatus({ state: "saving" });
    const res = await send("/api/account/delete", "POST", { confirm });
    if (res.ok) window.location.assign("/?account=deleted");
    else setStatus({ state: "error", message: res.error });
  }

  return <section className="mt-8 rounded-sm border border-[var(--line)] p-6">
    <details>
      <summary className="cursor-pointer text-lg font-medium text-[var(--ink)]">Delete account</summary>
      <form onSubmit={remove} className="mt-4 flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          This removes your account, your settings, any Premium access, the messages you&rsquo;ve sent and your newsletter sign-up. It can&rsquo;t be undone.
          You can create a new free account later with the same email.
        </p>
        <label className="flex flex-col gap-2">
          <span className="landing-kicker">Type {email} to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={input} />
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={!matches || status.state === "saving"} className={`${button} border-[#e5484d] text-[#e5484d]`}>Delete my account</button>
          <StatusLine status={status} />
        </div>
      </form>
    </details>
  </section>;
}
