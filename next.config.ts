import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.robinhood.com" },
      { protocol: "https", hostname: "assets.parqet.com" },
    ],
  },
};

export default nextConfig;
