"use client";
/* ────────────────────────────────────────────────────────────────
   "Data as of" line (roadmap #21): when a module's data was last
   refreshed, from /api/data-status. Renders nothing until it knows,
   and nothing at all when the module has no refresh time (static
   reference data, or the status read failed), so it never shows a
   wrong or empty claim. Styling comes from the caller.
──────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";

type Status = Record<string, { updatedAt: string }>;

let pending: Promise<Status> | null = null;
function loadStatus(): Promise<Status> {
  pending ??= fetch("/api/data-status")
    .then((r) => (r.ok ? r.json() : { modules: {} }))
    .then((b: { modules?: Status }) => b.modules ?? {})
    .catch(() => { pending = null; return {}; });
  return pending;
}

/** "just now", "35 min ago", "6 hours ago", "yesterday", "3 days ago", or a date after a week. */
export function relativeAge(updatedAt: string, now = new Date()): string {
  const ms = now.getTime() - Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

export function DataAsOf({ module, prefix = " · ", className }: { module: string; prefix?: string; className?: string }) {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadStatus().then((s) => { if (live) setAt(s[module]?.updatedAt ?? null); });
    return () => { live = false; };
  }, [module]);
  if (!at) return null;
  const full = new Date(at).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney", timeZoneName: "short",
  });
  return (
    <span className={className} title={`Data last refreshed ${full}`}>
      {prefix}Data updated <time dateTime={at}>{relativeAge(at)}</time>
    </span>
  );
}
