import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in — A3RO Intelligence", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-40">
      <p className="landing-kicker">Owner sign-in</p>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">We'll email you a one-time sign-in link. Only existing accounts can sign in.</p>
      {error === "link" ? <p role="alert" className="text-sm text-[var(--ink-2)]">That link has expired or was already used. Request a new one.</p> : null}
      <LoginForm next={next ?? "/"} />
    </section>
  </main>;
}
