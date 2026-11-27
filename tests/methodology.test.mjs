// Methodology pages (roadmap #29): glossary links resolve and the pages are in the sitemap.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { GLOSSARY, GLOSSARY_IDS } = await import("../app/methodology/glossary/terms.ts");

test("glossary ids are unique and slug-shaped", () => {
  assert.equal(new Set(GLOSSARY_IDS).size, GLOSSARY_IDS.length);
  for (const id of GLOSSARY_IDS) assert.match(id, /^[a-z0-9-]+$/);
  for (const g of GLOSSARY) for (const e of g.entries) assert.ok(e.def.length > 20, e.id);
});

test("every <Term id> in the methodology pages points at a glossary entry", () => {
  const dir = "app/methodology";
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".tsx")).map((f) => path.join(dir, String(f)));
  const used = files.flatMap((f) => [...fs.readFileSync(f, "utf8").matchAll(/<Term id="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(used.length > 5);
  for (const id of used) assert.ok(GLOSSARY_IDS.includes(id), `missing glossary entry: ${id}`);
});

test("methodology pages are listed in the sitemap and outside the access gate", () => {
  const sitemap = fs.readFileSync("app/sitemap.ts", "utf8");
  assert.match(sitemap, /METHODOLOGY_PAGES/);
  const mw = fs.readFileSync("middleware.ts", "utf8");
  assert.doesNotMatch(mw, /methodology/);
});
