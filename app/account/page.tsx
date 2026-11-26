// Account settings for signed-in members (roadmap #105). Signed-out visitors go to sign-in first.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Nav } from "../components/Chrome";
import SiteFooter from "../components/SiteFooter";
import { currentViewer } from "../../lib/supabase/server";
import AccountSettings from "./AccountSettings";

export const metadata: Metadata = { title: "Your account — A3RO Intelligence", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await currentViewer();
  if (!viewer.signedIn) redirect("/login?next=/account");
  return <main className="relative min-h-screen">
    <Nav />
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-6 pb-20 pt-40">
      <p className="landing-kicker">Account</p>
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <AccountSettings />
    </section>
    <SiteFooter />
  </main>;
}
