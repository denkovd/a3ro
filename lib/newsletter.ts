// Newsletter settings shared by the admin API, the send cron and the unsubscribe route (roadmap #36).
import { resendConfig, unsubscribeSecret, type SendEnv } from "@a3ro/oil-backend";

export const SITE_URL = process.env.NEWSLETTER_SITE_URL || "https://a3ro.com.au";

/** Everything a send needs, or the name of what's missing. */
export function newsletterEnv(): { env: SendEnv } | { missing: string } {
  const resend = resendConfig();
  if (!resend) return { missing: "RESEND_API_KEY" };
  const secret = unsubscribeSecret();
  if (!secret) return { missing: "NEWSLETTER_SECRET (or CRON_SECRET)" };
  return { env: { resend, siteUrl: SITE_URL, secret } };
}
