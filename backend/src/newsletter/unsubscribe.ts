/* Signed unsubscribe links (roadmap #36): the token proves the link was
   ours for that email, so nobody can unsubscribe someone else by guessing. */
import { createHmac, timingSafeEqual } from "node:crypto";

export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.NEWSLETTER_SECRET || env.CRON_SECRET || null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function unsubscribeToken(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${normalizeEmail(email)}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string, secret: string): boolean {
  const expected = Buffer.from(unsubscribeToken(email, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function unsubscribeUrl(siteUrl: string, email: string, secret: string): string {
  const u = new URL("/unsubscribe", siteUrl);
  u.searchParams.set("e", normalizeEmail(email));
  u.searchParams.set("t", unsubscribeToken(email, secret));
  return u.toString();
}
