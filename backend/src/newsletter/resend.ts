/* Resend email API (roadmap #36). Batch endpoint: up to 100 emails per call. */

export const RESEND_BATCH_LIMIT = 100;

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Per-recipient unsubscribe link, also sent as List-Unsubscribe for one-click unsubscribe. */
  unsubscribeUrl?: string;
}

export interface ResendConfig { apiKey: string; from: string; replyTo?: string; fetchImpl?: typeof fetch }

export function resendConfig(env: Record<string, string | undefined> = process.env): ResendConfig | null {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: env.NEWSLETTER_FROM || "A3RO <newsletter@a3ro.com.au>", replyTo: env.NEWSLETTER_REPLY_TO || undefined };
}

const payload = (cfg: ResendConfig, e: OutgoingEmail) => ({
  from: cfg.from, to: [e.to], subject: e.subject, html: e.html, text: e.text,
  ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
  ...(e.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${e.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
});

/**
 * Sends up to 100 emails in one call. Returns Resend's id per email, in order.
 * `idempotencyKey` makes a retried call (same key) a no-op at Resend.
 */
export async function sendBatch(cfg: ResendConfig, emails: OutgoingEmail[], idempotencyKey?: string): Promise<string[]> {
  if (emails.length === 0) return [];
  if (emails.length > RESEND_BATCH_LIMIT) throw new Error(`Resend batch takes at most ${RESEND_BATCH_LIMIT} emails`);
  const res = await (cfg.fetchImpl ?? fetch)("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(emails.map((e) => payload(cfg, e))),
  });
  const body = await res.json().catch(() => null) as { data?: { id: string }[]; message?: string; name?: string } | null;
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message ?? body?.name ?? "request failed"}`);
  return (body?.data ?? []).map((d) => d.id);
}
