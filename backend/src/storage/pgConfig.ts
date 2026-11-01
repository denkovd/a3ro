import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";
import { SUPABASE_CA } from "./supabaseCa";

/** All remote database sessions require certificate and hostname-verified TLS. */
export function pgConnectionConfig(connectionString = process.env.DATABASE_URL): {
  connectionString: string;
  ssl: false | ConnectionOptions;
  connectionTimeoutMillis: number;
} {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    // URL errors otherwise include the complete input, including credentials.
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  const host = (url.searchParams.get("host") || decodeURIComponent(url.hostname)).toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const sslRequested = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]
    .some((key) => url.searchParams.has(key));
  const ssl: false | ConnectionOptions = local && !sslRequested ? false : {
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  };
  if (ssl) {
    const rootCert = url.searchParams.get("sslrootcert");
    if (rootCert) ssl.ca = readFileSync(rootCert, "utf8");
    else if (host.endsWith(".pooler.supabase.com") || /^db\.[a-z0-9]+\.supabase\.co$/.test(host)) ssl.ca = SUPABASE_CA;
    const clientCert = url.searchParams.get("sslcert");
    const clientKey = url.searchParams.get("sslkey");
    if (clientCert) ssl.cert = readFileSync(clientCert, "utf8");
    if (clientKey) ssl.key = readFileSync(clientKey, "utf8");
  }
  // pg's URL parser overwrites the ssl object when these parameters are left
  // in the URL. Never let sslmode=disable/no-verify weaken the remote policy.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }
  return { connectionString: url.toString(), ssl, connectionTimeoutMillis: 10_000 };
}
