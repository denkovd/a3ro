"use client";
import { useEffect, useState } from "react";
import { ANONYMOUS, type Viewer } from "../../lib/access";

/**
 * Who the visitor is: signed in, with Premium, an admin. Starts anonymous (Premium links stay
 * hidden until confirmed) and is a display hint only — middleware blocks gated pages and APIs.
 */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>(ANONYMOUS);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : ANONYMOUS))
      .then((body: Partial<Viewer>) => {
        if (live) setViewer({ signedIn: body.signedIn === true, premium: body.premium === true, admin: body.admin === true });
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return viewer;
}
