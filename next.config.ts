import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    proxyClientMaxBodySize: "20mb", // Updated to the correct non-deprecated option
  },
};

export default nextConfig;