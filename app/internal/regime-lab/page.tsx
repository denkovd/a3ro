import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { localResearchAllowed } from "../../api/_lib/internalResearchAccess";
import RegimeLab from "../../components/internal/RegimeLab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Regime testing board · A3RO internal", robots: { index: false, follow: false } };
export default async function RegimeLabPage() {
  const host = (await headers()).get("host");
  if (!host || !localResearchAllowed(`http://${host}`, process.env.NODE_ENV)) notFound();
  return <RegimeLab />;
}
