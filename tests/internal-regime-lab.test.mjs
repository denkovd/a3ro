import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
async function load(path, mocks = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => mocks[id] ?? require(id), module, module.exports);
  return module.exports;
}
const access = await load("app/api/_lib/internalResearchAccess.ts");
test("internal research requires development and loopback; production and cross-origin requests fail closed", () => {
  for (const host of ["localhost:3100", "127.0.0.1:3100", "[::1]:3100"]) {
    const url = `http://${host}/api/internal/regime-lab`;
    assert.equal(access.localResearchAllowed(url, "development", `http://${host}`), true);
    assert.equal(access.localResearchAllowed(url, "production"), false);
    assert.equal(access.localResearchAllowed(url, "test"), false);
    assert.equal(access.localResearchAllowed(url, "development", "https://external.example"), false);
  }
  for (const host of ["a3ro.com.au", "192.168.1.2", "localhost.evil.example"]) assert.equal(access.localResearchAllowed(`http://${host}`, "development"), false);
  const normalised = new Request("http://localhost:3100/api/internal/regime-lab", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } });
  assert.equal(access.localResearchRequestAllowed(normalised, "development"), true);
  const external = new Request(normalised, { headers: { host: "a3ro.com.au", origin: "https://a3ro.com.au" } });
  assert.equal(access.localResearchRequestAllowed(external, "development"), false);
});
test("production requests are rejected before any history read or calculation", async (t) => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  t.after(() => previous === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = previous);
  let reads = 0;
  const route = await load("app/api/internal/regime-lab/route.ts", {
    "node:fs/promises": { readFile: async () => { reads++; throw new Error("Must not read"); } },
    "../../../../backend/src/macro/internalResearch": {}, "../../../../backend/src/macro/backtestResearch": {}, "../../_lib/internalResearchAccess": access,
  });
  assert.equal((await route.GET(new Request("http://localhost:3100/api/internal/regime-lab"))).status, 404);
  assert.equal((await route.POST(new Request("http://localhost:3100/api/internal/regime-lab", { method: "POST" }))).status, 404);
  assert.equal(reads, 0);
});

test("the page returns not-found in production independently of the API guard", async (t) => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  t.after(() => previous === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = previous);
  const page = await load("app/internal/regime-lab/page.tsx", {
    "next/headers": { headers: async () => new Headers({ host: "localhost:3100" }) },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "../../api/_lib/internalResearchAccess": access,
    "../../components/internal/RegimeLab": () => null,
  });
  await assert.rejects(page.default(), /NOT_FOUND/);
  assert.equal(page.metadata.robots.index, false);
});
