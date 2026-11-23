"use client";
import { useEffect, useState } from "react";

/**
 * Whether the visitor is the signed-in owner. Starts false (owner-only links stay hidden until
 * confirmed) and is a display hint only — middleware blocks gated pages and APIs.
 */
export function useOwner(): boolean {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { owner: false }))
      .then((body: { owner?: unknown }) => { if (live) setOwner(body.owner === true); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return owner;
}
