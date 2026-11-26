import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/owner", "/internal", "/login", "/auth/", "/private", "/account"] },
    sitemap: "https://a3ro.com.au/sitemap.xml",
  };
}
