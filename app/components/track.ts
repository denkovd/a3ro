"use client";
// Anonymous interaction events (roadmap #46). Fire-and-forget: never blocks, never throws.
export type TrackType = "page_view" | "outbound" | "search" | "asset_view" | "signup" | "watch";

export function track(type: TrackType, detail: { target?: string | null; resultCount?: number } = {}): void {
  try {
    if (typeof window === "undefined" || navigator.webdriver) return;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, path: location.pathname, target: detail.target ?? null, resultCount: detail.resultCount }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort only.
  }
}
