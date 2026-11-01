import assert from "node:assert/strict";
import { test } from "node:test";
import { X509Certificate } from "node:crypto";
import { Client } from "pg";
import { pgConnectionConfig } from "../src/storage/pgConfig";
import { SUPABASE_CA } from "../src/storage/supabaseCa";

test("remote connections verify TLS even with connection-string downgrade options", () => {
  for (const query of ["", "?sslmode=disable", "?sslmode=no-verify", "?ssl=0", "?sslmode=require&uselibpqcompat=true"]) {
    const config = pgConnectionConfig(`postgres://user:password@aws-0-region.pooler.supabase.com:6543/postgres${query}`);
    const client = new Client(config);
    const parsed = (client as unknown as { connectionParameters: { ssl: { ca?: string; rejectUnauthorized?: boolean; minVersion?: string } } }).connectionParameters.ssl;
    assert.equal(parsed.rejectUnauthorized, true);
    assert.equal(parsed.minVersion, "TLSv1.2");
    assert.equal(parsed.ca, SUPABASE_CA);
  }
});

test("host overrides cannot turn a remote session into a plaintext local session", () => {
  const config = pgConnectionConfig("postgres://user:password@localhost/postgres?host=example.com&sslmode=disable");
  assert.notEqual(config.ssl, false);
});

test("local development remains usable and untrusted hosts get no Supabase CA", () => {
  assert.equal(pgConnectionConfig("postgres://user:password@127.0.0.1/postgres").ssl, false);
  const config = pgConnectionConfig("postgres://user:password@evil.pooler.supabase.com.attacker.test/postgres");
  assert.ok(config.ssl);
  assert.equal(config.ssl.ca, undefined);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test("malformed connection errors do not contain secrets", () => {
  assert.throws(() => pgConnectionConfig("not-a-url:secret-value"), /^Error: DATABASE_URL must be a valid PostgreSQL URL$/);
});

test("bundled Supabase root matches official download and is valid", () => {
  const cert = new X509Certificate(SUPABASE_CA);
  assert.equal(cert.ca, true);
  assert.equal(cert.fingerprint256.replaceAll(":", "").toLowerCase(), "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa");
  assert.ok(Date.parse(cert.validTo) > Date.now());
});
