import { releaseDateLabel, type AustraliaReleaseSchedule } from "./australiaWatchData";

export default function ReleaseSchedule({ schedule, quarterly = false }: { schedule?: AustraliaReleaseSchedule; quarterly?: boolean }) {
  const next = schedule?.next;
  return <div className="mt-4 border-l-2 pl-3 text-xs" style={{ borderColor: "var(--line)" }}>
    <p className="text-[var(--ink-3)]">Next {quarterly ? "quarterly " : ""}release{next ? ` · ${next.referencePeriod}` : ""}</p>
    <p className="mt-1 text-[var(--ink)]">{releaseDateLabel(next?.releaseAt)}</p>
    {quarterly && schedule?.nextPublication && <p className="mt-2 leading-relaxed text-[var(--ink-3)]">Monthly CPI: {releaseDateLabel(schedule.nextPublication.releaseAt)}. These charts use quarterly figures.</p>}
    {schedule && <a className="mt-2 inline-block underline text-[var(--ink-3)]" href={schedule.sourceUrl} target="_blank" rel="noreferrer">ABS release calendar ↗</a>}
  </div>;
}
