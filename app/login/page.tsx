import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in — A3RO Intelligence", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-40">
      <p className="landing-kicker">Owner sign-in</p>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      {error === "link" ? <p role="alert" className="text-sm text-[var(--ink-2)]">That link has expired or was already used. Try again.</p> : null}
      {error === "google" ? <p role="alert" className="text-sm text-[var(--ink-2)]">Google sign-in isn't available right now. Use the email link instead.</p> : null}
      <form method="post" action="/auth/google">
        <input type="hidden" name="next" value={next ?? "/"} />
        <button type="submit" className="w-full rounded-sm border border-[var(--line)] px-3 py-2 text-sm transition-colors hover:border-[var(--line-2)]">
          Continue with Google
        </button>
      </form>
      <p className="landing-kicker">Or email me a one-time link</p>
      <LoginForm next={next ?? "/"} />
    </section>
    <SiteFooter />
  </main>;
}
