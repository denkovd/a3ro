import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(relativePath, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const req = (id) => id.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)), cache) : (() => { throw new Error(`Unexpected dependency: ${id}`); })();
  new Function("require", "module", "exports", outputText)(req, module, module.exports);
  return module.exports;
}
const assets = load("lib/assets.ts");
const notes = load("lib/assetNotes.ts");

test("asset catalogue (#38): every kind present, slugs unique and URL-safe", () => {
  const slugs = assets.ASSETS.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, s);
  for (const kind of ["us_stock", "asx_stock", "etf", "crypto"]) assert.ok(assets.ASSETS.some((a) => a.kind === kind), kind);
  assert.ok(assets.ASSETS.length > 600);
});

test("TradingView symbols and slugs for the awkward cases", () => {
  const brk = assets.assetBySlug("brk-b");
  assert.equal(brk.tv, "BRK.B"); assert.equal(brk.trendSymbol, "BRK-B");
  const btc = assets.assetBySlug("btc-usd");
  assert.equal(btc.tv, "CRYPTO:BTCUSD"); assert.equal(btc.ticker, "BTC"); assert.equal(btc.trendSymbol, "BTC-USD");
  const bhp = assets.assetBySlug("asx-bhp");
  assert.equal(bhp.tv, "ASX:BHP"); assert.equal(bhp.trendSymbol, null, "ASX isn't in Trend Finder yet (#22)");
  assert.notEqual(assets.assetBySlug("asx-all").name, assets.assetBySlug("all").name, "ASX ALL and US ALL are different pages");
  assert.equal(assets.tradingViewUrl("ASX:BHP"), "https://www.tradingview.com/symbols/ASX-BHP/");
  assert.equal(assets.tradingViewUrl("AAPL"), "https://www.tradingview.com/symbols/AAPL/");
  assert.equal(assets.assetBySlug("nope"), null);
});

test("search (#39): ticker beats name, punctuation and case ignored", () => {
  const idx = assets.searchIndex();
  assert.equal(assets.searchAssets(idx, "aapl")[0].t, "AAPL");
  assert.equal(assets.searchAssets(idx, "brk b")[0].t, "BRK.B");
  assert.equal(assets.searchAssets(idx, "apple")[0].t, "AAPL");
  assert.ok(assets.searchAssets(idx, "bitcoin").some((r) => r.s === "btc-usd"));
  assert.ok(assets.searchAssets(idx, "BHP").some((r) => r.s === "asx-bhp"));
  assert.deepEqual(assets.searchAssets(idx, "   "), []);
  assert.ok(assets.searchAssets(idx, "a", 5).length <= 5);
});

test("asset notes are keyed by real slugs and dated", () => {
  for (const [slug, note] of Object.entries(notes.ASSET_NOTES)) {
    assert.ok(assets.assetBySlug(slug), `${slug} is not an asset page`);
    assert.match(note.updated, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(note.summary && note.body.length, slug);
  }
});
