export function localResearchAllowed(url: string, nodeEnv: string | undefined, origin?: string | null): boolean {
  if (nodeEnv !== "development") return false;
  try {
    const target = new URL(url);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !["http:", "https:"].includes(target.protocol)) return false;
    return !origin || new URL(origin).origin === target.origin;
  } catch { return false; }
}

export function localResearchRequestAllowed(request: Request, nodeEnv: string | undefined): boolean {
  // Next can normalise request.url to localhost while the browser uses 127.0.0.1.
  // Validate its URL and the actual Host independently, then bind Origin to Host.
  if (!localResearchAllowed(request.url, nodeEnv)) return false;
  const target = new URL(request.url), host = request.headers.get("host") ?? target.host;
  return localResearchAllowed(`${target.protocol}//${host}`, nodeEnv, request.headers.get("origin"));
}
