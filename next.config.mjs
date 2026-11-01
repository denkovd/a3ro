/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Allow production verification alongside an existing development server.
  distDir: process.env.A3RO_BUILD_DIR || ".next",
  transpilePackages: ["three"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // These directives do not interfere with Next's inline hydration scripts.
        { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
      ],
    }];
  },
  async redirects() {
    return [
      {
        source: "/Projects/Regime-Finder",
        destination: "/Projects/Bull-Market-Finder",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
