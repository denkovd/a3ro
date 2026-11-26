// Newsletter unsubscribe (roadmap #36). The emailed link opens this page; the button does the
// unsubscribing, so email scanners that open links can't unsubscribe anyone by visiting it.
// Mail apps' one-click unsubscribe posts straight to /api/newsletter/unsubscribe.
import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Unsubscribe — A3RO Intelligence", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function UnsubscribePage({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const email = one(q.e), token = one(q.t), status = one(q.status);

  if (status === "done") {
    return <LegalPage kicker="Newsletter" title="You're unsubscribed">
      <p>You won&rsquo;t get the A3RO weekly any more. Changed your mind? Sign up again from any page with a newsletter box, or from your Account page.</p>
    </LegalPage>;
  }
  if (status === "invalid" || !email || !token) {
    return <LegalPage kicker="Newsletter" title="This link doesn't work">
      <p>The unsubscribe link is incomplete or has been changed. Use the link at the bottom of any A3RO email, or reply to the email and we&rsquo;ll take you off the list.</p>
    </LegalPage>;
  }
  return <LegalPage kicker="Newsletter" title="Unsubscribe">
    <p>Stop sending the A3RO weekly to <strong className="text-[var(--ink)]">{email}</strong>?</p>
    <form method="post" action="/api/newsletter/unsubscribe" className="mt-6">
      <input type="hidden" name="e" value={email} />
      <input type="hidden" name="t" value={token} />
      <button type="submit" className="rounded-sm border border-[var(--ink)] px-4 py-2 text-sm text-[var(--ink)]">Unsubscribe</button>
    </form>
  </LegalPage>;
}
