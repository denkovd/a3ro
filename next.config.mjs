/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow production verification alongside an existing development server.
  distDir: process.env.A3RO_BUILD_DIR || ".next",
  transpilePackages: ["three"],
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
