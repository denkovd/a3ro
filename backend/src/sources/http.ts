/* ────────────────────────────────────────────────────────────────
   Shared HTTP plumbing for source adapters — extracted from
   OilPriceSource.ts's BaseSource.getJson so both the price-domain
   BaseSource and the corridor-domain CorridorBaseSource can share
   one implementation, including bounded response bodies and a
   timeout that covers both headers and body consumption.
──────────────────────────────────────────────────────────────── */

import { SourceError, SourceErrorKind } from "../core/types";

export interface GetResponseOptions {
  timeoutMs?: number;
  /** Maximum decoded response bytes, including HTTP error bodies. */
  maxResponseBytes?: number;
  headers?: Record<string, string>;
}

export interface GetJsonOptions extends GetResponseOptions {
  /** Called on non-2xx to refine the error kind from the body. */
  classifyHttpError?: (status: number, body: string) => SourceErrorKind | undefined;
}

export const MAX_SOURCE_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Fetch a complete, bounded response before releasing the timeout. */
export async function getResponseForSource(
  sourceId: string,
  url: string,
  opts: GetResponseOptions = {},
): Promise<{ response: Response; body: Uint8Array }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxResponseBytes = opts.maxResponseBytes ?? MAX_SOURCE_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReader = () => { void reader?.cancel().catch(() => {}); };

  try {
    const response = await fetch(url, { headers: opts.headers, signal: controller.signal });
    reader = response.body?.getReader();
    controller.signal.addEventListener("abort", cancelReader, { once: true });
    controller.signal.throwIfAborted();

    const oversized = () => new SourceError(
      sourceId, "bad_payload", `response exceeds ${maxResponseBytes} byte limit`,
    );
    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > maxResponseBytes) throw oversized();

    const chunks: Uint8Array[] = [];
    let length = 0;
    while (reader) {
      const chunk = await reader.read();
      controller.signal.throwIfAborted();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxResponseBytes) throw oversized();
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { response, body };
  } catch (cause) {
    const timedOut = controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError");
    controller.abort();
    cancelReader();
    if (cause instanceof SourceError) throw cause;
    throw new SourceError(sourceId, "network", timedOut ? `timeout after ${timeoutMs}ms` : String(cause), { cause });
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", cancelReader);
    reader?.releaseLock();
  }
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

  const { response: res, body: bytes } = await getResponseForSource(sourceId, url, opts);
  const body = new TextDecoder().decode(bytes);

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
