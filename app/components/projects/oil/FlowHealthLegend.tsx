"use client";
import { flowHealth } from "../oilTrackerShared";

export default function FlowHealthLegend({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
        Flow vs 1y norm
      </span>
      <div className="mt-[6px] flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {[
          { c: flowHealth(0.5), t: "<85%" },
          { c: flowHealth(1), t: "85–115%" },
          { c: flowHealth(1.5), t: ">115%" },
        ].map((s) => (
          <span key={s.t} className="flex items-center gap-[5px]">
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: s.c }}
            />
            {s.t}
          </span>
        ))}
      </div>
    </div>
  );
}
