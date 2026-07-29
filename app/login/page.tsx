"use client";
/* ────────────────────────────────────────────────────────────────
   Write-auth login (H1 fix). Not part of the public site design
   system — a plain utility page for the single operator to unlock
   write access (portfolio, thesis lab) on this device. Sets an
   httpOnly cookie via POST /api/auth/login; the token never touches
   localStorage or app state. See app/api/_lib/writeAuth.ts.
──────────────────────────────────────────────────────────────── */
import { useState } from "react";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setError(body.error ?? `request failed (${res.status})`);
        return;
      }
      setStatus("ok");
      setToken("");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "network error");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "system-ui, sans-serif",
        padding: "1.5rem",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
          A3RO write access
        </h1>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="write token"
          style={{
            background: "#171717",
            border: "1px solid #333",
            borderRadius: 6,
            padding: "0.5rem 0.75rem",
            color: "#e5e5e5",
            fontSize: "0.875rem",
          }}
        />
        <button
          type="submit"
          disabled={status === "busy" || !token}
          style={{
            background: "#e5e5e5",
            color: "#0a0a0a",
            border: "none",
            borderRadius: 6,
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            opacity: status === "busy" || !token ? 0.5 : 1,
          }}
        >
          {status === "busy" ? "checking…" : "unlock"}
        </button>
        {status === "ok" && (
          <p style={{ fontSize: "0.8rem", color: "#4ade80" }}>
            Unlocked on this device. You can close this tab.
          </p>
        )}
        {status === "error" && (
          <p style={{ fontSize: "0.8rem", color: "#f87171" }}>{error}</p>
        )}
      </form>
    </main>
  );
}
