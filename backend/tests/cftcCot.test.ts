import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCotRows, fetchCotPositioning, WTI_CONTRACT_CODE } from "../src/sources/cftcCot";
import { SourceError } from "../src/core/types";

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response);

describe("parseCotRows", () => {
  test("coerces string numerics, computes net, sorts ascending, skips malformed", () => {
    const rows = [
      { report_date_as_yyyy_mm_dd: "2026-07-07T00:00:00.000", m_money_positions_long_all: "250000", m_money_positions_short_all: "90000" },
      { report_date_as_yyyy_mm_dd: "2026-06-30T00:00:00.000", m_money_positions_long_all: "240000", m_money_positions_short_all: "100000" },
      { report_date_as_yyyy_mm_dd: "bad-date", m_money_positions_long_all: "1", m_money_positions_short_all: "1" },
      { report_date_as_yyyy_mm_dd: "2026-06-23T00:00:00.000", m_money_positions_long_all: "", m_money_positions_short_all: "5" }, // missing long
    ];
    const obs = parseCotRows(rows);
    assert.equal(obs.length, 2);
    assert.deepEqual(obs.map((o) => o.date), ["2026-06-30", "2026-07-07"]); // ascending
    assert.equal(obs[1].net, 160000); // 250000 − 90000
  });
});

describe("fetchCotPositioning", () => {
  test("returns ascending observations for the WTI contract", async () => {
    const fetchImpl = async (url: Parameters<typeof fetch>[0]) => {
      assert.match(String(url), new RegExp(WTI_CONTRACT_CODE));
      return jsonResponse([
        { report_date_as_yyyy_mm_dd: "2026-07-07T00:00:00.000", m_money_positions_long_all: "250000", m_money_positions_short_all: "90000", market_and_exchange_names: "CRUDE OIL, LIGHT SWEET-WTI" },
      ]);
    };
    const s = await fetchCotPositioning({ fetchImpl });
    assert.equal(s.contractCode, WTI_CONTRACT_CODE);
    assert.equal(s.observations[0].net, 160000);
    assert.match(s.market, /WTI/);
  });

  test("empty array (wrong code / schema drift) → bad_payload", async () => {
    const fetchImpl = async () => jsonResponse([]);
    await assert.rejects(
      () => fetchCotPositioning({ fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
    );
  });

  test("non-array body → bad_payload", async () => {
    const fetchImpl = async () => jsonResponse({ error: "nope" });
    await assert.rejects(
      () => fetchCotPositioning({ fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "bad_payload",
    );
  });

  test("429 → rate_limited", async () => {
    const fetchImpl = async () => jsonResponse([], 429);
    await assert.rejects(
      () => fetchCotPositioning({ fetchImpl }),
      (e: unknown) => e instanceof SourceError && e.kind === "rate_limited",
    );
  });
});
