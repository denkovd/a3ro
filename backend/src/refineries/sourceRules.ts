import type { RefineryEvent } from "../../../lib/oil/refineries";

/** Explicit interpretation rules for known official statements. New articles remain notices.
 * A page re-fetch verifies evidence; it never changes a statement's publication date.
 */
export type SourceRule = { id: string; refineryId: string; url: string; required: RegExp[]; event: RefineryEvent };
export function extractOfficialEvent(rule: SourceRule, html: string, now = new Date().toISOString()) {
  const article = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|#39|quot);/g," ").replace(/\s+/g," ");
  if (!rule.required.every(p => p.test(article))) throw new Error("Official statement no longer matches its verified evidence rule");
  const e = rule.event;
  const publishedAt = e.publishedAt ? new Date(e.publishedAt).toISOString() : null;
  if (publishedAt && Date.parse(publishedAt) > Date.parse(now)) throw new Error("Invalid statement publication date");
  return { ...e, id: e.id ?? rule.id, refineryId: rule.refineryId, incidentId: e.incidentId ?? rule.id, scope: e.scope ?? "facility", confidence: e.confidence ?? "operator", publishedAt, verifiedAt: now };
}

export function officialArticleLinks(html: string, base: string) {
  const host = new URL(base).hostname;
  const links = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = m[2].replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
    const url = new URL(m[1], base);
    if (url.hostname !== host || !url.pathname.startsWith("/media-centre/press-releases/") || !/refin|recover|majeure|restart|maintenance|shutdown/i.test(title)) continue;
    url.hash = ""; url.search = "";
    if (title.length > 10) links.set(url.href, title.slice(0,180));
  }
  return [...links].map(([url,title]) => ({ url,title })).slice(0,8);
}
