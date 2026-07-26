/* ────────────────────────────────────────────────────────────────
   Google Trends CSV export parser — pure, no DOM dependency beyond
   the raw text (the caller reads the File via FileReader and hands
   us the string). Handles the single- or multi-term "interest over
   time" export: a preamble ("Category: ..."), a blank line, then a
   `Week,<term>: (Worldwide)[,<term2>: (Worldwide)...]` header and
   ISO-dated rows. Multi-term exports are averaged into one signal —
   documented, not silently dropped — since a narrative gets one
   attention metric per upload, not one per keyword.
──────────────────────────────────────────────────────────────── */
import type { AttentionDatapoint } from "./narrativeScoring";

export type CsvParseResult = {
  datapoints: AttentionDatapoint[];
  skippedRows: number;
  error: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEADER_RE = /^(week|day|date)\s*,/i;

export function parseGoogleTrendsCsv(
  csvText: string,
  narrativeId: string,
  source: string,
): CsvParseResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim());
  const headerIdx = lines.findIndex((l) => HEADER_RE.test(l));
  if (headerIdx === -1) {
    return {
      datapoints: [],
      skippedRows: 0,
      error: "no header row found — expected a line starting with Week/Day/Date,",
    };
  }

  const datapoints: AttentionDatapoint[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerIdx + 1)) {
    if (line.length === 0) continue;
    const cols = line.split(",");
    const date = cols[0]?.trim() ?? "";
    if (!DATE_RE.test(date)) {
      skipped++;
      continue;
    }
    const values: number[] = [];
    for (const raw of cols.slice(1)) {
      const cleaned = raw.trim();
      if (cleaned === "") continue;
      const v = cleaned === "<1" ? 0 : Number(cleaned);
      if (Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) {
      skipped++;
      continue;
    }
    const value = values.reduce((a, b) => a + b, 0) / values.length;
    datapoints.push({ narrativeId, date, metric: "google_trends", value, source });
  }

  if (datapoints.length === 0) {
    return { datapoints: [], skippedRows: skipped, error: "header row found but no usable data rows" };
  }
  return { datapoints, skippedRows: skipped, error: null };
}
