/** @type {import('next').NextConfig} */
const nextConfig = {
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
