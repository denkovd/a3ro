import { isIP } from "node:net";

const MAX_BODY_BYTES = 16 * 1024;
const BODY_TIMEOUT_MS = 5000;
const WINDOW_MS = 10 * 60 * 1000;
const CLIENT_LIMIT = 5;
const INSTANCE_LIMIT = 100;

export class LeadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** A bounded burst guard only. A shared edge/WAF limit is also needed across
 * serverless instances and cold starts. Never trust forwarded IPs off Vercel. */
export function createLeadBurstGuard() {
  let expiresAt = 0;
  let total = 0;
  const clients = new Map<string, number>();
  return (request: Request): Response | null => {
    const now = Date.now();
    if (now >= expiresAt) {
      expiresAt = now + WINDOW_MS;
      total = 0;
      clients.clear();
    }
    // Vercel overwrites X-Forwarded-For at its ingress. A self-hosted caller
    // can forge this header, so all unidentified callers share one bucket.
    const forwarded = process.env.VERCEL === "1" ? request.headers.get("x-forwarded-for") ?? "" : "";
    const key = isIP(forwarded) ? forwarded : "unidentified";
    const count = clients.get(key) ?? 0;
    if (total >= INSTANCE_LIMIT || count >= CLIENT_LIMIT) {
      return Response.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((expiresAt - now) / 1000))), "Cache-Control": "no-store" },
      });
    }
    total++;
    clients.set(key, count + 1);
    return null;
  };
}

export async function readLeadRequest(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new LeadRequestError("Content-Type must be application/json", 415);

  const origin = request.headers.get("origin");
  // Next may construct request.url with its internal listening hostname.
  // Host is the browser's actual destination; unlike X-Forwarded-Host, we
  // do not accept an arbitrary proxy override of it.
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) target.host = host;
  if (process.env.VERCEL === "1") {
    const protocol = request.headers.get("x-forwarded-proto");
    if (protocol === "https" || protocol === "http") target.protocol = `${protocol}:`;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== target.origin)) {
    throw new LeadRequestError("Cross-origin requests are not allowed", 403);
  }

  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new LeadRequestError("Request body is too large", 413);
  }
  if (!request.body) throw new LeadRequestError("Invalid JSON request body", 400);

  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LeadRequestError("Request body timed out", 408)), BODY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let size = 0;
      let text = "";
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) throw new LeadRequestError("Request body is too large", 413);
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text) as unknown;
    })()]);
  } catch (error) {
    // Do not await cancellation: a stalled client must not hold this handler.
    void reader.cancel().catch(() => undefined);
    if (error instanceof LeadRequestError) throw error;
    throw new LeadRequestError("Invalid JSON request body", 400);
  } finally {
    clearTimeout(timer);
  }
}
