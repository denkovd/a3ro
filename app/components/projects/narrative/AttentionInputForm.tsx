"use client";
/* ────────────────────────────────────────────────────────────────
   Manual datapoint entry + Google Trends CSV upload for one
   narrative. Structured inputs only, per the module's v1 scope:
   no RSS, no screenshots, no autonomous crawling — everything here
   is either typed by hand or a file the user chose to hand over.
──────────────────────────────────────────────────────────────── */
import { useRef, useState } from "react";
import { NARR_ACCENT } from "./narrativeData";
import { parseGoogleTrendsCsv } from "./narrativeCsv";
import type { AttentionDatapoint } from "./narrativeScoring";

const inputClass =
  "w-full rounded-[2px] border border-[var(--line)] bg-[var(--depth-0)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink)] outline-none transition-colors duration-[var(--dur-micro)] focus:border-[var(--line-2)]";
const labelClass = "font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-3)]";

export default function AttentionInputForm({
  narrativeId,
  onAdd,
}: {
  narrativeId: string;
  onAdd: (datapoints: AttentionDatapoint[]) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [metric, setMetric] = useState("manual_score");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(value);
    if (!date || !metric.trim() || !Number.isFinite(v)) return;
    onAdd([{ narrativeId, date, metric: metric.trim(), value: v, source: source.trim() || "manual" }]);
    setValue("");
  };

  const onCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = parseGoogleTrendsCsv(text, narrativeId, file.name);
    if (result.error) {
      setCsvNotice(`${file.name}: ${result.error}`);
    } else {
      onAdd(result.datapoints);
      setCsvNotice(
        `${file.name}: added ${result.datapoints.length} datapoint${result.datapoints.length === 1 ? "" : "s"}` +
          (result.skippedRows > 0 ? ` · skipped ${result.skippedRows} unparseable row${result.skippedRows === 1 ? "" : "s"}` : ""),
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="rounded-sm border border-[var(--line)] bg-[var(--depth-1)] p-4">
      <p className={labelClass}>Feed this narrative</p>

      <form onSubmit={submitManual} className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <div className="col-span-1">
          <label className={labelClass} htmlFor="dp-date">Date</label>
          <input id="dp-date" type="date" className={`${inputClass} mt-1`} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-span-1">
          <label className={labelClass} htmlFor="dp-metric">Metric</label>
          <input id="dp-metric" type="text" className={`${inputClass} mt-1`} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="manual_score" />
        </div>
        <div className="col-span-1">
          <label className={labelClass} htmlFor="dp-value">Value</label>
          <input id="dp-value" type="number" inputMode="decimal" className={`${inputClass} mt-1`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </div>
        <div className="col-span-1">
          <label className={labelClass} htmlFor="dp-source">Source</label>
          <input id="dp-source" type="text" className={`${inputClass} mt-1`} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. mentions count" />
        </div>
        <div className="col-span-2 flex items-end md:col-span-1">
          <button
            type="submit"
            className="w-full rounded-[2px] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-[var(--dur-micro)]"
            style={{ borderColor: `${NARR_ACCENT}55`, color: NARR_ACCENT }}
          >
            Add
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3.5">
        <label
          className="cursor-pointer rounded-[2px] border border-[var(--line)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-2)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--line-2)]"
          htmlFor={`csv-${narrativeId}`}
        >
          Upload Google Trends CSV
          <input ref={fileRef} id={`csv-${narrativeId}`} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvChange} />
        </label>
        {csvNotice && <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">{csvNotice}</p>}
      </div>
    </div>
  );
}
