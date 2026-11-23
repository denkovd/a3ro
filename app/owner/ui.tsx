import type { ReactNode } from "react";

export function OpsSection({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return <section className="rounded-sm border border-[var(--line)] p-5">
    <h2 className="text-sm font-medium">{title}</h2>
    {note ? <p className="mt-1 text-xs text-[var(--ink-3)]">{note}</p> : null}
    <div className="mt-4">{children}</div>
  </section>;
}

export function OpsTable({ cols, rows, empty = "Nothing yet." }: { cols: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-xs text-[var(--ink-3)]">{empty}</p>;
  return <div className="overflow-x-auto"><table className="w-full text-xs">
    <thead><tr className="text-left text-[var(--ink-3)]">{cols.map((c, i) => <th key={c} className={`pb-2 pr-3 font-normal ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[var(--line)] align-top">{r.map((v, j) => <td key={j} className={`py-1.5 pr-3 ${j ? "text-right font-mono" : ""}`}>{v ?? "—"}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function OpsPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-20 pt-8 md:px-10">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {intro ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--ink-3)]">{intro}</p> : null}
    </header>
    {children}
  </div>;
}

export const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
export const ago = (hours: number | null) => hours == null ? "never" : hours < 1 ? "under 1h" : hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
