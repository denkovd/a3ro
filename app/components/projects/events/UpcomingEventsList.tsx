"use client";
/* ────────────────────────────────────────────────────────────────
   UpcomingEventsList — the events feature's control surface: next N
   upcoming events, category toggles, and the JSON/CSV upload entry
   point. Reusable in any view; embedded standalone on Regime-Shift
   (which has no date-axis chart for EventOverlay to attach to) and
   optionally alongside a chart integration elsewhere.

   Toggling a category here affects every EventOverlay on the page
   (and future page loads) — both read the same localStorage-backed
   hook in events/eventsData.ts, no shared context needed.
──────────────────────────────────────────────────────────────── */
import { useMemo, useState } from "react";
import {
  useMarketEvents,
  useEventCategoryToggles,
  parseUploadedEventsFile,
  CATEGORY_LABEL,
} from "./eventsData";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function UpcomingEventsList({ limit = 6 }: { limit?: number }) {
  const { status, events, addUploaded } = useMarketEvents();
  const { isEnabled, toggle } = useEventCategoryToggles();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(events.map((e) => e.category))).sort(),
    [events],
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.date >= today && isEnabled(e.category))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, limit),
    [events, today, isEnabled, limit],
  );

  const onFile = (file: File) => {
    setUploadError(null);
    parseUploadedEventsFile(file)
      .then(({ events: parsed, errors }) => {
        if (parsed.length > 0) addUploaded(parsed);
        if (errors.length > 0) {
          setUploadError(
            parsed.length > 0
              ? `${errors.length} row(s) skipped — ${errors[0]}`
              : `Nothing imported — ${errors[0]}`,
          );
        }
      })
      .catch(() => setUploadError("Could not read file"));
  };

  return (
    <div className="mt-12 border-t border-[var(--line)] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--ink-3)]">
          Upcoming events
        </p>
        <label className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]">
          + Upload events (JSON/CSV)
          <input
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = isEnabled(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className="rounded-[3px] border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] transition-colors"
                style={{
                  borderColor: on ? "var(--ink-2)" : "var(--line)",
                  color: on ? "var(--ink-2)" : "var(--ink-3)",
                }}
                aria-pressed={on}
              >
                {CATEGORY_LABEL[c] ?? c}
              </button>
            );
          })}
        </div>
      )}

      {uploadError && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-2)]">{uploadError}</p>
      )}

      {status === "loading" && (
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Loading…</p>
      )}

      {status !== "loading" && upcoming.length === 0 && (
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          No upcoming events in the enabled categories
        </p>
      )}

      {upcoming.length > 0 && (
        <div className="mt-5 space-y-2">
          {upcoming.map((e) => (
            <div key={e.id} className="flex items-baseline gap-3">
              <span className="w-14 shrink-0 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                {formatEventDate(e.date)}
              </span>
              <span className="flex-1 text-[12px] text-[var(--ink-2)]">
                {e.label}
                {e.userAdded && (
                  <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                    user-added
                  </span>
                )}
              </span>
              {e.sourceUrl && (
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
                >
                  source
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
