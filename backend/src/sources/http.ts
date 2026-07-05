/* ────────────────────────────────────────────────────────────────
   Shared HTTP plumbing for source adapters — extracted from
   OilPriceSource.ts's BaseSource.getJson so both the price-domain
   BaseSource and the corridor-domain CorridorBaseSource can share
   one implementation. Behavior is byte-for-byte identical to the
   original: same SourceError kinds/messages, same timeout default,
   same classifyHttpError hook, same Retry-After parsing.
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";

export interface GetJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Called on non-2xx to refine the error kind from the body. */
  classifyHttpError?: (status: number, body: string) => SourceErrorKind | undefined;
}

/**
 * HTTP GET → parsed JSON, with timeout and the default
 * status→SourceError mapping. Adapters may refine the mapping via
 * classifyHttpError (e.g. EIA returns 403 for BOTH bad keys and
 * throttled keys — the body tells them apart).
 */
export async function getJsonForSource<T = unknown>(
  sourceId: string,
  url: string,
  opts: GetJsonOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Function declaration (not a const arrow fn) so TypeScript's control-flow
  // analysis reliably treats calls to it as unreachable-after, matching how
  // `this.fail(): never` behaved as a class method in the pre-extraction code.
  function fail(
    kind: SourceErrorKind,
    message: string,
    failOpts: { retryAfterMs?: number; status?: number; cause?: unknown } = {},
  ): never {
    throw new SourceError(sourceId, kind, message, failOpts);
  }

  let res: Response;
  try {
    res = await fetch(url, { headers: opts.headers, signal: controller.signal });
  } catch (cause) {
    clearTimeout(timer);
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    fail("network", timedOut ? `timeout after ${timeoutMs}ms` : String(cause), { cause });
  } finally {
    clearTimeout(timer);
  }

  const body = await res.text();

  if (!res.ok) {
    const refined = opts.classifyHttpError?.(res.status, body);
    const kind: SourceErrorKind =
      refined ??
      (res.status === 401 || res.status === 403 ? "auth"
        : res.status === 429 ? "rate_limited"
        : res.status >= 500 ? "upstream_error"
        : "bad_payload");
    const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
    fail(kind, `HTTP ${res.status}: ${body.slice(0, 300)}`, {
      status: res.status,
      retryAfterMs,
    });
  }

  try {
    return JSON.parse(body) as T;
  } catch (cause) {
    fail("bad_payload", `response is not JSON: ${body.slice(0, 200)}`, { cause });
  }
}

export function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}
