import type { Metadata } from "next";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in or create an account — A3RO Intelligence", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; mode?: string }> }) {
  const { next, error, mode } = await searchParams;
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-40">
      <p className="landing-kicker">Account</p>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in or create an account</h1>
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">New here? Continue with Google or create an account with your email. Accounts are free; Premium modules open once your account has Premium.</p>
      {error === "link" ? <p role="alert" className="text-sm text-[var(--ink-2)]">That link has expired or was already used. Sign in, or ask for a new link with “Forgot your password”.</p> : null}
      {error === "google" ? <p role="alert" className="text-sm text-[var(--ink-2)]">Google sign-in isn't available right now. Use your email and password instead.</p> : null}
      <form method="post" action="/auth/google">
        <input type="hidden" name="next" value={next ?? "/"} />
        <button type="submit" className="w-full rounded-sm border border-[var(--line)] px-3 py-2 text-sm transition-colors hover:border-[var(--line-2)]">
          Continue with Google
        </button>
      </form>
      <p className="landing-kicker">Or use your email</p>
      <LoginForm next={next ?? "/"} initialMode={mode === "signup" ? "signup" : "signin"} />
    </section>
    <SiteFooter />
  </main>;
}
