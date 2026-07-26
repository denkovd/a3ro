import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scoreNarratives,
  type AttentionDatapoint,
} from "../app/components/projects/narrative/narrativeScoring";

/* ────────────────────────────────────────────────────────────────
   Golden-file test — Narrative Rotation scoring engine (Task 3,
   PLAN-frontend-intelligence-modules.md). Fixture recomputed by hand
   once below; any future change to narrativeScoring.ts must keep
   these exact numbers or the fixture/comment needs updating together
   with a fresh by-hand recomputation, not just a "make it pass" edit.

   Hand computation for tests/fixtures/narrative-inputs.json:

   ai google_trends series: 40 (06-26), 55 (07-19), 60 (07-25), 70 (07-26=asOf)
     1d delta (asOf vs 07-25): 70 - 60 = 10
     1w delta (asOf vs 07-19): 70 - 55 = 15
     1m delta (asOf vs 06-26): 70 - 40 = 30

   uranium google_trends series: 50, 48, 45, 40 (same dates)
     1d delta: 40 - 45 = -5
     1w delta: 40 - 48 = -8
     1m delta: 40 - 50 = -10

   memes: single datapoint (20 on asOf) — below MIN_INPUT_COUNT (3) →
   insufficient_data regardless of any delta math.

   Cross-sectional z-score per (metric, window), population stdev over
   {ai, uranium} (memes contributes no delta):
     1d: values {10, -5}, mean 2.5, stdev 7.5  → z_ai = 1, z_uranium = -1
     1w: values {15, -8}, mean 3.5, stdev 11.5 → z_ai = 1, z_uranium = -1
     1m: values {30, -10}, mean 10, stdev 20   → z_ai = 1, z_uranium = -1

   Weights sum to 1 (0.5 + 0.3 + 0.2), all three windows present for
   both narratives, so score = weight-normalized mean of z = ±1 exactly.
──────────────────────────────────────────────────────────────── */

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/narrative-inputs.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  asOf: string;
  narrativeIds: string[];
  datapoints: AttentionDatapoint[];
};

test("narrative rotation scoring matches hand-computed golden values", () => {
  const scores = scoreNarratives(fixture.narrativeIds, fixture.datapoints, fixture.asOf);

  const ai = scores.ai;
  assert.equal(ai.status, "scored");
  assert.equal(ai.score, 1);
  assert.deepEqual(ai.chips, { "1d": 1, "1w": 1, "1m": 1 });
  assert.equal(ai.contributions.length, 3);

  const uranium = scores.uranium;
  assert.equal(uranium.status, "scored");
  assert.equal(uranium.score, -1);
  assert.deepEqual(uranium.chips, { "1d": -1, "1w": -1, "1m": -1 });

  const memes = scores.memes;
  assert.equal(memes.status, "insufficient_data");
  assert.equal(memes.score, null);
  assert.deepEqual(memes.chips, { "1d": null, "1w": null, "1m": null });
  assert.equal(memes.inputCount, 1);
});

test("a narrative with zero fed datapoints is insufficient_data, not a crash", () => {
  const scores = scoreNarratives(["ghost"], [], "2026-07-26");
  assert.equal(scores.ghost.status, "insufficient_data");
  assert.equal(scores.ghost.score, null);
  assert.equal(scores.ghost.inputCount, 0);
});

test("datapoints for a narrative id outside the requested list are ignored", () => {
  const dp: AttentionDatapoint[] = [
    { narrativeId: "not-tracked", date: "2026-07-26", metric: "google_trends", value: 99, source: "x" },
  ];
  const scores = scoreNarratives(["ai"], dp, "2026-07-26");
  assert.equal(scores.ai.inputCount, 0);
  assert.equal(scores.ai.status, "insufficient_data");
});
