import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFredCsv, fetchFredSeries, MACRO_SERIES } from "../src/sources/fredMacro";
import { SourceError } from "../src/core/types";

const cfg = MACRO_SERIES.find((s) => s.seriesId === "T10Y2Y")!;

const csvResponse = (body: string) =>
  ({ ok: true, status: 200, text: async () => body } as unknown as Response);

describe("parseFredCsv", () => {
  test("parses date,value rows and skips header + missing dots", () => {
    const rows = parseFredCsv("observation_date,T10Y2Y\n2026-07-08,0.55\n2026-07-09,.\n2026-07-10,0.58\n");
    assert.deepEqual(rows, [
      { date: "2026-07-08", value: 0.55 },
      { date: "2026-07-10", value: 0.58 },
    ]);
  });
  test("tolerates the older DATE,VALUE header and blank lines", () => {
    const rows = parseFredCsv("DATE,VALUE\n\n2026-07-10,1.2\n");
    assert.deepEqual(rows, [{ date: "2026-07-10", value: 1.2 }]);
  });
});

describe("fetchFredSeries", () => {
  test("returns ascending observations from CSV", async () => {
    const fetchImpl = async () => csvResponse("observation_date,T10Y2Y\n2026-07-10,0.58\n2026-07-08,0.55\n");
    const s = await fetchFredSeries(cfg, { fetchImpl, now: new Date("2026-07-11") });
    assert.equal(s.key, "curve_10y2y");
    assert.deepEqual(s.observations.map((o) => o.date), ["2026-07-08", "2026-07-10"]);
  });

  test("an HTML error page (bad id) throws bad_payload", async () => {
    const fetchImpl = async () => csvResponse("<html><body>Not found</body></html>");
    await assert.rejects(
      () => fetchFredSeries(cfg, { fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
    );
  });

  test("zero usable rows (discontinued) throws bad_payload", async () => {
    const fetchImpl = async () => csvResponse("observation_date,T10Y2Y\n");
    await assert.rejects(
      () => fetchFredSeries(cfg, { fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
    );
  });

  test("429 throws rate_limited", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "" } as unknown as Response);
    await assert.rejects(
      () => fetchFredSeries(cfg, { fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
    );
  });
});
