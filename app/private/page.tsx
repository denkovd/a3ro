// Shown (via middleware rewrite) when a visitor without Premium opens a Premium module.
// Signed out: create an account or sign in. Signed in without Premium: what Premium includes and a
// way to hear when it opens (roadmap #35: the gate is a lead source).
import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import SignupForm from "./SignupForm";
import { MODULE_ACCESS, safeNextPath } from "../../lib/access";
import { currentViewer } from "../../lib/supabase/server";

export const metadata: Metadata = { title: "Premium — A3RO Intelligence", robots: { index: false, follow: false } };

const PUBLIC_LINKS = [
  { href: "/Projects/Australia-Watch", label: "Australia Watch" },
  { href: "/Projects/AI-Dividend", label: "AI Dividend" },
  { href: "/Projects/Oil-Tracker", label: "Commodity Watch" },
];

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ module?: string; next?: string }> }) {
  const params = await searchParams;
  const module = MODULE_ACCESS.find((m) => m.id === params.module && !m.hidden);
  const next = safeNextPath(params.next);
  const viewer = await currentViewer();
  const premiumModules = MODULE_ACCESS.filter((m) => m.level === "premium" && !m.hidden);
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-xl flex-col gap-6 px-6 pb-20 pt-40">
      <p className="landing-kicker">Premium</p>
      <h1 className="text-3xl font-semibold tracking-tight">{module ? module.label : "This module"} is part of A3RO Premium</h1>
      {module?.preview ? <p className="text-base leading-relaxed text-[var(--ink)]">{module.preview}</p> : null}

      {viewer.signedIn ? <>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          You&rsquo;re signed in{viewer.email ? <> as {viewer.email}</> : null}, but your account doesn&rsquo;t have Premium yet.
          Premium is opening to a small group first. Leave your email and we&rsquo;ll let you know when you can join.
        </p>
        <SignupForm moduleId={module?.id ?? "unknown"} />
      </> : <>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Sign in to an account with Premium to open it. New here? Create a free account first, with Google or your email and a password.
        </p>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="sweep w-fit font-mono text-xs uppercase tracking-[0.2em]">Sign in or create an account ↗</a>
        <SignupForm moduleId={module?.id ?? "unknown"} />
      </>}

      <div className="flex flex-col gap-2">
        <p className="landing-kicker">Premium includes</p>
        <ul className="text-sm leading-relaxed text-[var(--ink-2)]">
          {premiumModules.map((m) => <li key={m.id}>{m.label}</li>)}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="landing-kicker">Free for everyone</p>
        <div className="flex flex-wrap gap-6">
          {PUBLIC_LINKS.map((l) => <a key={l.href} href={l.href} className="sweep font-mono text-xs uppercase tracking-[0.2em]">{l.label} ↗</a>)}
        </div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
