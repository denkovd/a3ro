// Public pages for search engines (roadmap #12). Module pages come from lib/access.ts, so owner-only
// modules are never listed (they're also noindex and gated).
import type { MetadataRoute } from "next";
import { MODULE_ACCESS } from "../lib/access";

const SITE = "https://a3ro.com.au";

export default function sitemap(): MetadataRoute.Sitemap {
  const modules = MODULE_ACCESS.filter((m) => m.level === "public" && !m.hidden).flatMap((m) => m.pages);
  const pages: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    ...modules.map((path) => ({ path, changeFrequency: "daily" as const, priority: 0.9 })),
    { path: "/markets", changeFrequency: "daily", priority: 0.8 },
    { path: "/calendar", changeFrequency: "daily", priority: 0.8 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.2 },
  ];
  return pages.map((p) => ({ url: `${SITE}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
