import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchAustraliaReleaseSchedules, parseAbsReleasePage } from "../src/sources/absReleases";
import { estimateFreshness } from "../src/australia/watch";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const now = new Date("2026-11-02T00:00:00Z");

test("quarterly CPI dates skip the intervening monthly publications and holiday delay", async () => {
  const schedule = parseAbsReleasePage(await fixture("abs-release-cpi.html"), "quarterly", "https://source", now);
  assert.equal(schedule.latestReferencePeriod, "2026-Q3");
  assert.deepEqual(schedule.latest, { referencePeriod: "2026-Q3", releaseAt: "2026-10-28T00:30:00.000Z" });
  assert.deepEqual(schedule.next, { referencePeriod: "2026-Q4", releaseAt: "2027-01-27T00:30:00.000Z" });
  assert.deepEqual(schedule.nextPublication, { referencePeriod: "2026-10", releaseAt: "2026-11-25T00:30:00.000Z" });
  assert.equal(estimateFreshness("quarterly", "2026-Q2", now, schedule.latestReferencePeriod), "aging");
});

test("employment and hours share the headline Labour Force release, not detailed labour", async () => {
  const cpi = await fixture("abs-release-cpi.html"), labour = await fixture("abs-release-labour.html");
  const urls: string[] = [];
  const schedules = await fetchAustraliaReleaseSchedules({ now, fetchImpl: (async (url: string) => {
    urls.push(url); return new Response(url.includes("consumer-price") ? cpi : labour);
  }) as typeof fetch });
  assert.equal(urls.length, 2);
  assert.equal(schedules.hours_worked, schedules.unemployment_rate);
  assert.deepEqual(schedules.hours_worked.next, { referencePeriod: "2026-10", releaseAt: "2026-11-19T00:30:00.000Z" });
  assert.equal(schedules.hours_worked.latestReferencePeriod, "2026-09");
});

test("elapsed release dates are not presented as upcoming", async () => {
  const schedule = parseAbsReleasePage(await fixture("abs-release-labour.html"), "monthly", "https://source", new Date("2026-11-19T00:30:00Z"));
  assert.equal(schedule.next?.referencePeriod, "2026-11");
});

test("winter release times use AEST rather than a fixed daylight-saving offset", async () => {
  const html = (await fixture("abs-release-labour.html")).replace("19/11/2026", "16/07/2026").replace("October 2026", "June 2026");
  const schedule = parseAbsReleasePage(html, "monthly", "https://source", new Date("2026-07-01T00:00:00Z"));
  assert.equal(schedule.next?.releaseAt, "2026-07-16T01:30:00.000Z");
});

test("an intervening monthly CPI does not invent a quarterly publication date", async () => {
  const html = (await fixture("abs-release-cpi.html")).replace(">September 2026<", ">October 2026<");
  const schedule = parseAbsReleasePage(html, "quarterly", "https://source", now);
  assert.equal(schedule.latestReferencePeriod, "2026-Q3");
  assert.equal(schedule.latest, null);
});

test("calendar failure is isolated per family and never invents a release date", async () => {
  const labour = await fixture("abs-release-labour.html");
  const schedules = await fetchAustraliaReleaseSchedules({ now, fetchImpl: (async (url: string) => {
    if (url.includes("consumer-price")) throw new Error("timeout");
    return new Response(labour);
  }) as typeof fetch });
  assert.equal(schedules.headline_cpi_yoy.health, "unavailable");
  assert.equal(schedules.headline_cpi_yoy.next, null);
  assert.equal(schedules.hours_worked.health, "healthy");
  assert.throws(() => parseAbsReleasePage("<html>maintenance</html>", "monthly", "https://source", now), /metadata unavailable/);
});
