"use client";
// Logs a page view per route change and every click on a link to another site (by destination).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "./track";

export default function SiteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Admin and internal pages aren't counted.
    if (pathname.startsWith("/owner") || pathname.startsWith("/internal") || pathname.startsWith("/auth")) return;
    track("page_view");
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      try {
        const url = new URL(link.href, location.href);
        if ((url.protocol === "https:" || url.protocol === "http:") && url.host !== location.host) track("outbound", { target: url.href });
      } catch {
        // Not a URL we can read.
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
