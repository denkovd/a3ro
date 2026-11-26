// Passwords are set or changed only from an emailed link (roadmap #105): the sign-up link or a
// reset link. The session's verified `amr` claim says how and when it signed in; a password may be
// saved only if it came from one of those links within the last few minutes. A stolen session
// cookie, or a session signed in with Google or a password, can't change the password.

/** Sign-in methods Supabase records for emailed links (sign-up confirmation, magic link, reset, invite). */
const EMAIL_LINK_METHODS = new Set(["otp", "magiclink", "recovery", "email/signup", "invite"]);

/** How long after opening the link the password form keeps working. */
export const EMAIL_LINK_WINDOW_SECONDS = 15 * 60;

export interface AmrEntry { method?: unknown; timestamp?: unknown }

/** True when the session signed in through an emailed link within the window. */
export function signedInByRecentEmailLink(amr: unknown, nowSeconds = Math.floor(Date.now() / 1000), windowSeconds = EMAIL_LINK_WINDOW_SECONDS): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: AmrEntry) => {
    if (!entry || typeof entry.method !== "string" || !EMAIL_LINK_METHODS.has(entry.method)) return false;
    const at = Number(entry.timestamp);
    return Number.isFinite(at) && at <= nowSeconds + 60 && nowSeconds - at <= windowSeconds;
  });
}
