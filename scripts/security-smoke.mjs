import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Run after A3RO_BUILD_DIR=.next-security-review npm run build.
// Uses live read-only dashboard queries; POST probes cannot insert leads.
const base = "http://127.0.0.1:3107";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
  env: { ...process.env, A3RO_BUILD_DIR: ".next-security-review" },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local verification server did not become ready")), 15000);
    server.on("error", (error) => { clearTimeout(timer); reject(error); });
    server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exited (${code})`)); });
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready")) { clearTimeout(timer); resolve(); }
    });
    server.stderr.resume();
  });
  const results = [];
  for (const path of ["/", "/api/oil/latest", "/api/btc/latest", "/api/leaderboard/earnings-beats", "/api/cron/ingest"]) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    if (path.startsWith("/api/cron")) assert.ok([401, 503].includes(response.status));
    else assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("x-powered-by"), null);
    await response.arrayBuffer();
    results.push({ path, status: response.status });
  }
  for (const [name, headers, body, status] of [
    ["malformed JSON", { "content-type": "application/json" }, "{", 400],
    ["cross-origin", { "content-type": "application/json", origin: "https://attacker.invalid" }, "{}", 403],
    ["same-origin honeypot", { "content-type": "application/json", origin: base }, JSON.stringify({ email: "test@example.invalid", company: "security-check" }), 200],
  ]) {
    const response = await fetch(base + "/api/leads", { method: "POST", headers, body });
    assert.equal(response.status, status, name);
    await response.arrayBuffer();
    results.push({ name, status });
  }
  console.log(JSON.stringify({ passed: true, checks: results }, null, 2));
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}
