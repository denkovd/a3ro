import { notFound } from "next/navigation";
import { currentUserIsOwner } from "./supabase/server";

/** Second check behind middleware for owner pages: anyone else gets a 404. */
export async function requireOwner(): Promise<void> {
  if (!(await currentUserIsOwner())) notFound();
}

/** For owner write APIs: same-origin requests from the signed-in owner only. */
export async function ownerWriteAllowed(request: Request): Promise<boolean> {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) target.host = host;
  if (!origin || origin !== target.origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  return currentUserIsOwner();
}

/** Our own origin for server-to-server calls that carry a secret; null for any host that isn't ours. */
export function trustedOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const name = host.split(":")[0];
  const ok = name === "a3ro.com.au" || name === "www.a3ro.com.au" || name.endsWith(".vercel.app") || name === "localhost" || name === "127.0.0.1";
  if (!ok) return null;
  const local = name === "localhost" || name === "127.0.0.1";
  return `${local ? url.protocol : "https:"}//${host}`;
}
