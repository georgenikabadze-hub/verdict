import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CESIUM_BASE_URL: "/cesium",
  },
  webpack: (config) => {
    config.module.rules.push({ test: /\.glb$/, type: "asset/resource" });
    return config;
  },
};

export default nextConfig;
