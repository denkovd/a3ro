import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fetchGateWeeklySpreads } from "../src/sources/portwatchWeekly";
import { SourceError } from "../src/core/types";

const FIXED_NOW = new Date("2026-07-07T00:00:00.000Z");
const DAY_MS = 86_400_000;
// Hand-computed from FIXED_NOW (same arithmetic as portwatchBaselines.test.ts).
const FROM_1Y = "2025-07-07";
const FROM_5Y = "2021-07-08";
const FETCH_FROM = "2021-07-01"; // FROM_5Y minus one week

interface Row { portid: string; date: string; n_tanker: number | null; capacity_tanker: number | null }

/** Daily rows for one gate from `start` to FIXED_NOW inclusive. */
function gateRows(portid: string, start: string, valueOf: (i: number) => [number | null, number | null]): Row[] {
  const t0 = Date.parse(`${start}T00:00:00.000Z`);
  const rows: Row[] = [];
  for (let t = t0, i = 0; t <= FIXED_NOW.getTime(); t += DAY_MS, i++) {
    const [n, cap] = valueOf(i);
    rows.push({ portid, date: new Date(t).toISOString().slice(0, 10), n_tanker: n, capacity_tanker: cap });
  }
  return rows;
}

/** Serve `rows` in pages the way ArcGIS does: resultOffset/resultRecordCount
 *  slices, `exceededTransferLimit` while more remain. Records every URL. */
function stubPagedFetch(rows: Row[], seen: string[] = []) {
  global.fetch = async (url: string | URL) => {
    const u = new URL(String(url));
    seen.push(decodeURIComponent(u.search.replace(/\+/g, " ")));
    const offset = Number(u.searchParams.get("resultOffset"));
    const count = Number(u.searchParams.get("resultRecordCount"));
    const page = rows.slice(offset, offset + count);
    return new Response(
      JSON.stringify({
        features: page.map((attributes) => ({ attributes })),
        ...(offset + count < rows.length ? { exceededTransferLimit: true } : {}),
      }),
      { status: 200 },
    );
  };
  return seen;
}

describe("fetchGateWeeklySpreads (PortWatch daily rows → weekly spread)", () => {
  let originalFetch: typeof global.fetch;
  const setup = () => { originalFetch = global.fetch; };
  const teardown = () => { global.fetch = originalFetch; };

  test("pages through every row and returns 1y + 5y spreads for both metrics", async () => {
    setup();
    try {
      // Hormuz: steady 40 tankers / 2 Mt a day for five years. Suez: 20 / 1 Mt.
      const rows = [
        ...gateRows("chokepoint6", FETCH_FROM, () => [40, 2_000_000]),
        ...gateRows("chokepoint1", FETCH_FROM, () => [20, 1_000_000]),
      ];
      const seen = stubPagedFetch(rows);
      const out = await fetchGateWeeklySpreads(FIXED_NOW);

      // 2 gates × 2 metrics × 2 windows
      assert.equal(out.length, 8);
      const hormuz5y = out.find((r) => r.corridor === "hormuz" && r.metric === "tanker_transits" && r.win === "5y");
      assert.ok(hormuz5y);
      assert.equal(hormuz5y.weekly.p50, 40);
      assert.equal(hormuz5y.weekly.mad, 0);
      assert.equal(hormuz5y.weekly.n, 5 * 365 + 1); // every day FROM_5Y..today has a full week behind it
      assert.equal(hormuz5y.weekly.sampleFrom, FROM_5Y);
      assert.equal(hormuz5y.weekly.sampleTo, "2026-07-07");

      const suez1yVol = out.find((r) => r.corridor === "suez" && r.metric === "tanker_volume" && r.win === "1y");
      assert.ok(suez1yVol);
      assert.equal(suez1yVol.weekly.p50, 1); // tons/day → Mt/day, same unit as the baseline row
      assert.equal(suez1yVol.weekly.n, 366);
      assert.equal(suez1yVol.weekly.sampleFrom, FROM_1Y);

      // ~3,660 rows at 2,000 a page → two requests, the second offset by the first page
      assert.equal(seen.length, 2);
      assert.ok(seen[0].includes(`date >= DATE '${FETCH_FROM}'`));
      assert.ok(seen[0].includes("orderByFields=portid,date"));
      assert.ok(seen[0].includes("resultOffset=0"));
      assert.ok(seen[1].includes("resultOffset=2000"));
      // all six gates are asked for, from the shared CHOKEPOINTS list
      for (const id of ["chokepoint6", "chokepoint5", "chokepoint1", "chokepoint4", "chokepoint7", "chokepoint2"]) {
        assert.ok(seen[0].includes(`'${id}'`), `${id} missing from the IN list`);
      }
    } finally {
      teardown();
    }
  });

  test("null counts are gaps, not zeros; each metric keeps its own gaps", async () => {
    setup();
    try {
      // transits missing on every other day of the last 400 days (never 5 reported days in a week);
      // volume reported throughout
      const rows = gateRows("chokepoint6", "2025-05-01", (i) => [i % 2 === 0 ? 30 : null, 1_500_000]);
      stubPagedFetch(rows);
      const out = await fetchGateWeeklySpreads(FIXED_NOW);
      assert.equal(out.some((r) => r.metric === "tanker_transits"), false, "thin weeks must not produce a spread");
      const vol = out.filter((r) => r.metric === "tanker_volume");
      assert.equal(vol.length, 2);
      assert.ok(vol.every((r) => r.weekly.p50 === 1.5));
    } finally {
      teardown();
    }
  });

  test("a gate with no rows, an unknown portid or too little history yields no spread (not an error)", async () => {
    setup();
    try {
      const rows = [
        ...gateRows("chokepoint6", "2026-06-20", () => [10, 500_000]), // 18 days only
        ...gateRows("chokepoint99", FETCH_FROM, () => [5, 100_000]), // not one of ours
      ];
      stubPagedFetch(rows);
      assert.deepEqual(await fetchGateWeeklySpreads(FIXED_NOW), []);
    } finally {
      teardown();
    }
  });

  test("a token-required error body is classified auth and thrown", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 499, message: "Token Required" } }), { status: 200 });
      await assert.rejects(
        () => fetchGateWeeklySpreads(FIXED_NOW),
        (e: unknown) => e instanceof SourceError && e.kind === "auth" && /Token Required/.test(e.message),
      );
    } finally {
      teardown();
    }
  });

  test("any other error body is an upstream_error", async () => {
    setup();
    try {
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "Service busy" } }), { status: 200 });
      await assert.rejects(
        () => fetchGateWeeklySpreads(FIXED_NOW),
        (e: unknown) => e instanceof SourceError && e.kind === "upstream_error",
      );
    } finally {
      teardown();
    }
  });

  test("shape drift fails loud with a snippet of the payload", async () => {
    setup();
    try {
      global.fetch = async () => new Response(JSON.stringify({ rows: [] }), { status: 200 });
      await assert.rejects(
        () => fetchGateWeeklySpreads(FIXED_NOW),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload" && e.message.includes('{"rows":[]}'),
      );
      global.fetch = async () =>
        new Response(JSON.stringify({ features: [{ attributes: { portid: "chokepoint6", date: 1751846400000, n_tanker: 3 } }] }), { status: 200 });
      await assert.rejects(
        () => fetchGateWeeklySpreads(FIXED_NOW),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload" && /missing portid\/date/.test(e.message),
      );
    } finally {
      teardown();
    }
  });

  test("a server that never stops paging is cut off, not followed forever", async () => {
    setup();
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "test"; // skip the polite pause between pages
    try {
      let calls = 0;
      global.fetch = async () => {
        calls++;
        return new Response(
          JSON.stringify({
            exceededTransferLimit: true,
            features: [{ attributes: { portid: "chokepoint6", date: "2026-01-01", n_tanker: 1, capacity_tanker: 1 } }],
          }),
          { status: 200 },
        );
      };
      await assert.rejects(
        () => fetchGateWeeklySpreads(FIXED_NOW),
        (e: unknown) => e instanceof SourceError && e.kind === "bad_payload" && /did not finish/.test(e.message),
      );
      assert.equal(calls, 30);
    } finally {
      process.env.NODE_ENV = env;
      teardown();
    }
  });
});
